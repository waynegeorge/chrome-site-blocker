import { PASS_MINUTES, hostFromUrl, statusForHost } from './lib/core.js';
import { formatDuration, formatWhen, openNotes } from './lib/ui.js';

const reason = new URLSearchParams(location.search).get('r');
const original = location.hash.slice(1);
const host = hostFromUrl(original);
const $ = (id) => document.getElementById(id);

$('settings').addEventListener('click', () => chrome.runtime.openOptionsPage());
$('notes').addEventListener('click', openNotes);

let currentState = null;

// Saves the typed reason, if any. Returns false only if there was text and saving failed.
async function saveNote() {
  const text = $('note-text').value.trim();
  if (!text) return true;
  const res = await chrome.runtime.sendMessage({ type: 'note', url: original, text });
  if (!res?.ok) {
    $('note-status').textContent = `Could not save: ${res?.error ?? 'unknown error'}`;
    return false;
  }
  $('note-text').value = '';
  $('note-status').textContent = 'Note saved.';
  return true;
}

$('note-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!$('note-text').value.trim()) return $('note-text').focus();
  await saveNote();
});

$('note-text').addEventListener('input', () => { $('note-status').textContent = ''; });

$('go').addEventListener('click', async () => {
  $('go').disabled = true;
  // An unsaved reason goes with the visit rather than being lost.
  if (!(await saveNote())) {
    $('go').disabled = false;
    return;
  }
  if (currentState === 'blocked') {
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
  $('note-form').hidden = !host;
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
