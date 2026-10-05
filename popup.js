import { DAY_NAMES, siteLabel, siteStatus } from './lib/core.js';
import { clock, h, openNotes, statusText } from './lib/ui.js';

const ORDER = { blocked: 0, pass: 1, allowed: 2, off: 3 };

document.getElementById('settings').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
  window.close();
});

document.getElementById('notes').addEventListener('click', async () => {
  await openNotes();
  window.close();
});

async function render() {
  const { settings, passes = {}, log = [] } = await chrome.storage.local.get(['settings', 'passes', 'log']);
  const now = new Date();
  document.getElementById('now').textContent = `${DAY_NAMES[now.getDay()]} ${clock(now)}`;

  const list = document.getElementById('sites');
  const rows = (settings?.sites ?? [])
    .map((site) => ({ site, status: siteStatus(site, settings, passes, now) }))
    .sort((a, b) => ORDER[a.status.state] - ORDER[b.status.state]);

  list.replaceChildren(
    ...(rows.length
      ? rows.map(({ site, status }) =>
          h('li', {},
            h('span', { class: 'domain', title: siteLabel(site) }, site.domains[0]),
            h('span', { class: `status ${status.state}` }, statusText(status, now))))
      : [h('li', { class: 'empty muted' }, 'No sites yet.')]),
  );

  const todayStr = now.toDateString();
  const count = log.filter((e) => e.type === 'blocked' && new Date(e.ts).toDateString() === todayStr).length;
  document.getElementById('attempts').textContent = `Blocked attempts today: ${count}`;
}

render();
setInterval(render, 15_000);
