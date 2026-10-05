import { dayKey, groupNotesByDay } from './lib/core.js';
import { clock, downloadJson, h, today } from './lib/ui.js';

let notes = [];

const $ = (sel) => document.querySelector(sel);

function dayHeading(key) {
  const date = new Date(`${key}T00:00`);
  const full = date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const relative = key === today() ? 'Today' : key === dayKey(yesterday) ? 'Yesterday' : null;
  return relative ? [relative, h('span', { class: 'muted' }, ` · ${full}`)] : [full];
}

function noteRow(note) {
  const when = new Date(note.ts);
  return h('li', { class: 'note' },
    h('time', { class: 'muted', datetime: note.ts, title: when.toLocaleString('en-GB') }, clock(when)),
    h('span', { class: 'host', title: note.url }, note.host),
    h('span', { class: 'text' }, note.text),
    h('button', {
      class: 'icon danger',
      title: 'Delete note',
      'aria-label': `Delete note for ${note.host} at ${clock(when)}`,
      onclick: (e) => {
        e.currentTarget.disabled = true;
        chrome.runtime.sendMessage({ type: 'deleteNote', id: note.id });
      },
    }, '✕'));
}

function render() {
  const groups = groupNotesByDay(notes);
  $('#summary').textContent = notes.length
    ? `${notes.length} note${notes.length === 1 ? '' : 's'} over ${groups.length} day${groups.length === 1 ? '' : 's'}.`
    : 'No notes yet. Notes you write on the block page appear here.';
  $('#export').disabled = !notes.length;
  $('#days').replaceChildren(...groups.map((g) =>
    h('section', { class: 'day' },
      h('h2', {}, dayHeading(g.day), h('span', { class: 'muted' }, ` · ${g.notes.length} note${g.notes.length === 1 ? '' : 's'}`)),
      h('ul', {}, g.notes.map(noteRow)))));
}

$('#export').addEventListener('click', () => {
  downloadJson(`site-blocker-notes-${today()}.json`, {
    exportedAt: new Date().toISOString(),
    days: groupNotesByDay(notes).map((g) => ({
      day: g.day,
      notes: g.notes.map(({ ts, host, url, text }) => ({ ts, host, url, reason: text })),
    })),
  });
});

({ notes = [] } = await chrome.storage.local.get('notes'));
render();

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.notes) {
    notes = changes.notes.newValue ?? [];
    render();
  }
});
