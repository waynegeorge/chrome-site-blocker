import {
  MAX_LOG_ENTRIES,
  MAX_NOTE_LENGTH,
  PASS_MINUTES,
  defaultSettings,
  hostFromUrl,
  hostMatches,
  nextBoundary,
  siteLabel,
  siteStatus,
  statusForHost,
} from './lib/core.js';

const BLOCK_PAGE = chrome.runtime.getURL('blocked.html');

// All storage read-modify-write work runs through one queue so updates never interleave.
let queue = Promise.resolve();
function serial(fn) {
  const result = queue.then(fn);
  queue = result.catch((err) => console.error(err));
  return result;
}

const update = () => serial(applyBlocking);

chrome.runtime.onInstalled.addListener(async () => {
  const { settings } = await chrome.storage.local.get('settings');
  if (!settings) await chrome.storage.local.set({ settings: defaultSettings() });
  update();
});

chrome.runtime.onStartup.addListener(update);
chrome.alarms.onAlarm.addListener(update);

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes.settings || changes.passes)) update();
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  handleMessage(msg).then(sendResponse, (err) => sendResponse({ ok: false, error: String(err) }));
  return true;
});

// Safety net in case a precise alarm is missed (e.g. after sleep).
chrome.alarms.get('safety').then((alarm) => alarm || chrome.alarms.create('safety', { periodInMinutes: 1 }));
update();

function blockPageUrl(reason, url) {
  return `${BLOCK_PAGE}?r=${reason}#${url}`;
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function redirectRule(domain, id) {
  return {
    id,
    priority: 1,
    action: {
      type: 'redirect',
      // \0 is the whole matched URL, carried in the fragment so the block page knows where to return.
      redirect: { regexSubstitution: `${BLOCK_PAGE}?r=nav#\\0` },
    },
    condition: {
      regexFilter: `^https?://([^/?#]*\\.)?${escapeRegex(domain)}(:[0-9]+)?([/?#].*)?$`,
      resourceTypes: ['main_frame'],
    },
  };
}

async function applyBlocking() {
  const { settings, passes = {} } = await chrome.storage.local.get(['settings', 'passes']);
  const now = new Date();

  const livePasses = Object.fromEntries(Object.entries(passes).filter(([, until]) => until > now.getTime()));
  if (Object.keys(livePasses).length !== Object.keys(passes).length) {
    await chrome.storage.local.set({ passes: livePasses });
  }

  const blocked = new Set();
  for (const site of settings?.sites ?? []) {
    if (siteStatus(site, settings, livePasses, now).state === 'blocked') {
      site.domains.forEach((d) => blocked.add(d));
    }
  }
  const domains = [...blocked];

  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: existing.map((r) => r.id),
    addRules: domains.map((d, i) => redirectRule(d, i + 1)),
  });

  await redirectOpenTabs(domains);

  // Wake at the next 15-minute boundary or pass expiry, whichever is sooner.
  const wake = Math.min(nextBoundary(now).getTime(), ...Object.values(livePasses));
  await chrome.alarms.create('boundary', { when: wake + 500 });
}

async function redirectOpenTabs(domains) {
  if (!domains.length) return;
  const tabs = await chrome.tabs.query({});
  await Promise.all(
    tabs.map((tab) => {
      const host = hostFromUrl(tab.url ?? '');
      if (!host || !domains.some((d) => hostMatches(host, d))) return null;
      return chrome.tabs.update(tab.id, { url: blockPageUrl('active', tab.url) }).catch(() => {});
    }),
  );
}

async function appendLog(type, url, status) {
  const { log = [] } = await chrome.storage.local.get('log');
  log.push({
    ts: new Date().toISOString(),
    type,
    host: hostFromUrl(url),
    url,
    site: siteLabel(status.site),
    schedule: status.schedule.name,
  });
  if (log.length > MAX_LOG_ENTRIES) log.splice(0, log.length - MAX_LOG_ENTRIES);
  await chrome.storage.local.set({ log });
}

async function currentStatus(url) {
  const host = hostFromUrl(url);
  const { settings, passes = {} } = await chrome.storage.local.get(['settings', 'passes']);
  return host && settings ? statusForHost(host, settings, passes, new Date()) : null;
}

function handleMessage(msg) {
  return serial(async () => {
    const status = await currentStatus(msg.url);

    if (msg.type === 'attempt') {
      if (status) await appendLog('blocked', msg.url, status);
      return { ok: true };
    }

    if (msg.type === 'pass') {
      if (status?.state === 'blocked') {
        const { passes = {} } = await chrome.storage.local.get('passes');
        passes[status.site.id] = Date.now() + PASS_MINUTES * 60_000;
        await chrome.storage.local.set({ passes });
        await appendLog('pass', msg.url, status);
        await applyBlocking(); // already inside the queue, so call directly
      }
      return { ok: true };
    }

    if (msg.type === 'note') {
      const text = String(msg.text ?? '').trim().slice(0, MAX_NOTE_LENGTH);
      const host = hostFromUrl(msg.url);
      if (!text || !host) return { ok: false, error: 'A note needs a reason and a site.' };
      const { notes = [] } = await chrome.storage.local.get('notes');
      notes.push({ id: crypto.randomUUID(), ts: new Date().toISOString(), host, url: msg.url, text });
      await chrome.storage.local.set({ notes });
      return { ok: true };
    }

    if (msg.type === 'deleteNote') {
      const { notes = [] } = await chrome.storage.local.get('notes');
      await chrome.storage.local.set({ notes: notes.filter((n) => n.id !== msg.id) });
      return { ok: true };
    }

    return { ok: false, error: `Unknown message: ${msg.type}` };
  });
}
