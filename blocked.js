import { PASS_MINUTES, hostFromUrl, statusForHost } from './lib/core.js';
import { formatDuration, formatWhen } from './lib/ui.js';

const reason = new URLSearchParams(location.search).get('r');
const original = location.hash.slice(1);
const host = hostFromUrl(original);
const $ = (id) => document.getElementById(id);

$('settings').addEventListener('click', () => chrome.runtime.openOptionsPage());

let currentState = null;

$('go').addEventListener('click', async () => {
  if (currentState === 'blocked') {
    $('go').disabled = true;
    await chrome.runtime.sendMessage({ type: 'pass', url: original });
  }
  location.replace(original);
});

async function render() {
  const { settings, passes = {} } = await chrome.storage.local.get(['settings', 'passes']);
  const now = new Date();
  const status = host && settings ? statusForHost(host, settings, passes, now) : null;
  currentState = status?.state ?? null;

  $('host').textContent = host ?? 'This site';
  $('url').textContent = original;
  document.title = host ? `Blocked · ${host}` : 'Blocked';

  const blocked = currentState === 'blocked';
  $('badge').textContent = blocked ? 'Blocked' : 'Not blocked';
  $('badge').classList.toggle('lifted', !blocked);

  if (blocked) {
    $('reason').textContent = `Blocked by the “${status.schedule.name}” schedule`;
    $('lift').textContent = status.until ? `Lifts at ${formatWhen(status.until, now)}` : 'Blocked at all times';
    $('countdown').textContent = status.until ? `in ${formatDuration(status.until - now)}` : '';
    $('go').textContent = `Give me ${PASS_MINUTES} minutes`;
  } else {
    $('reason').textContent = status ? 'The block has lifted.' : 'This site is no longer on your block list.';
    $('lift').textContent = '';
    $('countdown').textContent = '';
    $('go').textContent = 'Continue to site';
  }
  $('go').hidden = !host;
}

await render();
setInterval(render, 15_000);
chrome.storage.onChanged.addListener((changes) => {
  if (changes.settings || changes.passes) render();
});

// Count genuine attempts only: not reloads, and not tabs switched here when a block started.
const navType = performance.getEntriesByType('navigation')[0]?.type;
if (reason === 'nav' && navType !== 'reload' && navType !== 'back_forward' && host) {
  chrome.runtime.sendMessage({ type: 'attempt', url: original });
}
