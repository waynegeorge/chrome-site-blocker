import {
  ALWAYS_ID,
  DAY_NAMES,
  DAY_ORDER,
  DEFAULT_SCHEDULE_ID,
  TIME_OPTIONS,
  fromMinutes,
  parseDomainList,
  siteStatus,
  toMinutes,
  validateSettings,
} from './lib/core.js';
import { downloadJson, formatWhen, h, statusText, today } from './lib/ui.js';

let settings;
let passes = {};
let log = [];

const $ = (sel) => document.querySelector(sel);

function save() {
  return chrome.storage.local.set({ settings });
}

let toastTimer;
function toast(message, isError = false) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.toggle('error', isError);
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3500);
}

// ---------- Tabs ----------

function showTab(name) {
  for (const btn of document.querySelectorAll('nav button')) {
    btn.setAttribute('aria-selected', String(btn.dataset.tab === name));
  }
  for (const panel of document.querySelectorAll('[role="tabpanel"]')) {
    panel.hidden = panel.id !== `tab-${name}`;
  }
  history.replaceState(null, '', `#${name}`);
}

for (const btn of document.querySelectorAll('nav button')) {
  btn.addEventListener('click', () => showTab(btn.dataset.tab));
}

// ---------- Sites ----------

function scheduleSelect(selectedId, onChange, attrs = {}) {
  return h('select', { ...attrs, onchange: (e) => onChange(e.target.value) },
    settings.schedules.map((s) => h('option', { value: s.id, selected: s.id === selectedId }, s.name)),
    h('option', { value: ALWAYS_ID, selected: selectedId === ALWAYS_ID }, 'Always'));
}

function domainsInUse(exceptSiteId) {
  return new Set(settings.sites.filter((s) => s.id !== exceptSiteId).flatMap((s) => s.domains));
}

function siteRow(site) {
  const toggle = h('label', { class: 'switch', title: 'Enable or disable blocking for this site' },
    h('input', {
      type: 'checkbox',
      checked: site.enabled,
      'aria-label': `Block ${site.domains[0]}`,
      onchange: (e) => { site.enabled = e.target.checked; save(); renderStatuses(); },
    }),
    h('span'));

  const domains = h('input', {
    type: 'text',
    value: site.domains.join(', '),
    'aria-label': 'Domains',
    onchange: (e) => {
      const { domains: parsed, invalid } = parseDomainList(e.target.value);
      const taken = parsed.filter((d) => domainsInUse(site.id).has(d));
      if (invalid.length || !parsed.length || taken.length) {
        toast(
          taken.length ? `Already listed: ${taken.join(', ')}` : `Not a valid domain: ${invalid.join(', ') || '(empty)'}`,
          true,
        );
        e.target.value = site.domains.join(', ');
        return;
      }
      site.domains = parsed;
      e.target.value = parsed.join(', ');
      save();
      renderStatuses();
    },
  });

  const remove = h('button', {
    class: 'icon danger',
    title: 'Remove site',
    'aria-label': `Remove ${site.domains[0]}`,
    onclick: () => {
      if (!confirm(`Remove ${site.domains.join(', ')}?`)) return;
      settings.sites = settings.sites.filter((s) => s !== site);
      save();
      renderSites();
    },
  }, '✕');

  return h('tr', {},
    h('td', {}, toggle),
    h('td', {}, domains),
    h('td', {}, scheduleSelect(site.scheduleId, (id) => { site.scheduleId = id; save(); renderStatuses(); renderSchedules(); },
      { 'aria-label': 'Schedule' })),
    h('td', {}, h('span', { class: 'status', dataset: { siteId: site.id } })),
    h('td', {}, remove));
}

function renderSites() {
  $('#sites-body').replaceChildren(...settings.sites.map(siteRow));
  const addSelect = $('#add-schedule');
  const keep = addSelect.value || DEFAULT_SCHEDULE_ID;
  addSelect.replaceWith(scheduleSelect(keep, () => {}, { id: 'add-schedule', 'aria-label': 'Schedule for new site' }));
  renderStatuses();
}

function renderStatuses() {
  const now = new Date();
  for (const el of document.querySelectorAll('.status[data-site-id]')) {
    const site = settings.sites.find((s) => s.id === el.dataset.siteId);
    if (!site) continue;
    const status = siteStatus(site, settings, passes, now);
    el.className = `status ${status.state}`;
    el.textContent = statusText(status, now);
  }
}

$('#add-site').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = $('#add-domains');
  const { domains, invalid } = parseDomainList(input.value);
  if (!domains.length && !invalid.length) return;
  if (invalid.length) return toast(`Not a valid domain: ${invalid.join(', ')}`, true);
  const taken = domains.filter((d) => domainsInUse().has(d));
  if (taken.length) return toast(`Already listed: ${taken.join(', ')}`, true);

  settings.sites.push({ id: crypto.randomUUID(), domains, enabled: true, scheduleId: $('#add-schedule').value });
  save();
  input.value = '';
  renderSites();
  toast(`Added ${domains.join(', ')}`);
});

// ---------- Schedules ----------

function sortRanges(schedule) {
  schedule.ranges.sort((a, b) => toMinutes(a.start) - toMinutes(b.start));
}

function timeSelect(value, options, onChange, label) {
  return h('select', { 'aria-label': label, onchange: (e) => onChange(e.target.value) },
    options.map((t) => h('option', { value: t, selected: t === value }, t)));
}

function rangeRow(schedule, range) {
  const commit = () => { sortRanges(schedule); save(); renderSchedules(); renderStatuses(); };
  return h('div', { class: 'range' },
    timeSelect(range.start, TIME_OPTIONS.slice(0, -1), (v) => {
      range.start = v;
      if (toMinutes(range.end) <= toMinutes(v)) range.end = fromMinutes(toMinutes(v) + 15);
      commit();
    }, 'Start time'),
    h('span', { class: 'muted' }, 'to'),
    timeSelect(range.end, TIME_OPTIONS.slice(1), (v) => {
      range.end = v;
      if (toMinutes(range.start) >= toMinutes(v)) range.start = fromMinutes(toMinutes(v) - 15);
      commit();
    }, 'End time'),
    h('button', {
      class: 'icon danger',
      title: 'Remove time range',
      'aria-label': 'Remove time range',
      onclick: () => { schedule.ranges = schedule.ranges.filter((r) => r !== range); commit(); },
    }, '✕'));
}

function suggestRange(schedule) {
  const last = schedule.ranges.at(-1);
  if (!last) return { start: '09:00', end: '17:00' };
  const start = Math.min(toMinutes(last.end), 23 * 60);
  return { start: fromMinutes(start), end: fromMinutes(Math.min(start + 60, 24 * 60)) };
}

function scheduleCard(schedule) {
  const used = settings.sites.filter((s) => s.scheduleId === schedule.id).length;
  const isDefault = schedule.id === DEFAULT_SCHEDULE_ID;

  const name = h('input', {
    type: 'text',
    class: 'name',
    value: schedule.name,
    'aria-label': 'Schedule name',
    onchange: (e) => {
      schedule.name = e.target.value.trim() || schedule.name;
      e.target.value = schedule.name;
      save();
      renderSites();
    },
  });

  const days = DAY_ORDER.map((d) =>
    h('label', { class: 'day' },
      h('input', {
        type: 'checkbox',
        checked: schedule.days.includes(d),
        onchange: (e) => {
          schedule.days = e.target.checked
            ? [...schedule.days, d].sort((a, b) => a - b)
            : schedule.days.filter((x) => x !== d);
          save();
          renderSchedules();
          renderStatuses();
        },
      }),
      h('span', {}, DAY_NAMES[d])));

  const neverBlocks = !schedule.days.length || !schedule.ranges.length;

  return h('section', { class: 'card' },
    h('div', { class: 'sched-head' },
      name,
      h('span', { class: 'muted small' }, `Used by ${used} site${used === 1 ? '' : 's'}`),
      isDefault
        ? h('span', { class: 'muted small' }, '· Default')
        : h('button', { class: 'danger', onclick: () => deleteSchedule(schedule, used) }, 'Delete')),
    h('div', { class: 'days' }, days),
    neverBlocks && h('p', { class: 'hint muted small' }, 'Pick at least one day and time range, otherwise this schedule never blocks.'),
    schedule.ranges.map((r) => rangeRow(schedule, r)),
    h('button', {
      onclick: () => { schedule.ranges.push(suggestRange(schedule)); sortRanges(schedule); save(); renderSchedules(); renderStatuses(); },
    }, '+ Add time range'));
}

function deleteSchedule(schedule, used) {
  const message = used
    ? `Delete “${schedule.name}”? Its ${used} site${used === 1 ? '' : 's'} will move to the Default schedule.`
    : `Delete “${schedule.name}”?`;
  if (!confirm(message)) return;
  for (const site of settings.sites) if (site.scheduleId === schedule.id) site.scheduleId = DEFAULT_SCHEDULE_ID;
  settings.schedules = settings.schedules.filter((s) => s !== schedule);
  save();
  renderAll();
}

function renderSchedules() {
  $('#schedules').replaceChildren(...settings.schedules.map(scheduleCard));
}

$('#add-schedule-btn').addEventListener('click', () => {
  let n = 1;
  while (settings.schedules.some((s) => s.name === `Custom ${n}`)) n++;
  settings.schedules.push({
    id: crypto.randomUUID(),
    name: `Custom ${n}`,
    days: [1, 2, 3, 4, 5],
    ranges: [{ start: '09:00', end: '17:00' }],
  });
  save();
  renderAll();
  $('#schedules').lastElementChild?.querySelector('input.name')?.select();
});

// ---------- Data ----------

$('#export-settings').addEventListener('click', () => {
  downloadJson(`site-blocker-settings-${today()}.json`, settings);
});

$('#import-settings').addEventListener('click', () => $('#import-file').click());

$('#import-file').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const imported = validateSettings(JSON.parse(await file.text()));
    const summary = `${imported.sites.length} sites and ${imported.schedules.length} schedules`;
    if (!confirm(`Replace your current settings with ${summary} from ${file.name}?`)) return;
    settings = imported;
    await save();
    renderAll();
    toast(`Imported ${summary}`);
  } catch (err) {
    toast(`Import failed: ${err.message}`, true);
  }
});

function activityTotals() {
  const todayStr = new Date().toDateString();
  const bySite = new Map();
  for (const entry of log) {
    const row = bySite.get(entry.site) ?? { site: entry.site, today: 0, blocked: 0, passes: 0, last: null };
    if (entry.type === 'pass') row.passes++;
    else {
      row.blocked++;
      if (new Date(entry.ts).toDateString() === todayStr) row.today++;
      row.last = entry.ts;
    }
    bySite.set(entry.site, row);
  }
  return [...bySite.values()].sort((a, b) => b.blocked - a.blocked || b.passes - a.passes);
}

function renderActivity() {
  const totals = activityTotals();
  const blocked = totals.reduce((n, r) => n + r.blocked, 0);
  const first = log[0] ? new Date(log[0].ts).toLocaleDateString('en-GB') : null;
  $('#activity-summary').textContent = first
    ? `${blocked} blocked attempt${blocked === 1 ? '' : 's'} recorded since ${first}.`
    : 'No activity recorded yet.';
  $('#activity-body').replaceChildren(...totals.map((r) =>
    h('tr', {},
      h('td', {}, r.site),
      h('td', { class: 'num' }, String(r.today)),
      h('td', { class: 'num' }, String(r.blocked)),
      h('td', { class: 'num' }, String(r.passes)),
      h('td', {}, r.last ? formatWhen(new Date(r.last)) : '—'))));
}

$('#export-log').addEventListener('click', () => {
  downloadJson(`site-blocker-activity-${today()}.json`, {
    exportedAt: new Date().toISOString(),
    totals: activityTotals().map(({ site, blocked, passes: passCount, last }) => ({
      site, blocked, passes: passCount, lastAttempt: last,
    })),
    entries: log,
  });
});

$('#clear-log').addEventListener('click', async () => {
  if (!confirm('Clear the whole activity log?')) return;
  await chrome.storage.local.set({ log: [] });
});

// ---------- Init ----------

function renderAll() {
  renderSites();
  renderSchedules();
  renderActivity();
}

({ settings, passes = {}, log = [] } = await chrome.storage.local.get(['settings', 'passes', 'log']));
if (!settings) {
  document.body.textContent = 'Settings not found. Try reloading the extension.';
} else {
  renderAll();
  const initial = location.hash.slice(1);
  showTab(['sites', 'schedules', 'data'].includes(initial) ? initial : 'sites');

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.settings && JSON.stringify(changes.settings.newValue) !== JSON.stringify(settings)) {
      settings = changes.settings.newValue;
      renderAll();
    }
    if (changes.passes) {
      passes = changes.passes.newValue ?? {};
      renderStatuses();
    }
    if (changes.log) {
      log = changes.log.newValue ?? [];
      renderActivity();
    }
  });
  setInterval(renderStatuses, 15_000);
}
