// Small DOM and formatting helpers shared by the extension pages.
import { DAY_NAMES } from './core.js';

export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value == null || value === false) continue;
    if (key.startsWith('on')) el.addEventListener(key.slice(2), value);
    else if (key === 'class') el.className = value;
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (key in el) el[key] = value;
    else el.setAttribute(key, value === true ? '' : value);
  }
  el.append(...children.flat(Infinity).filter((c) => c != null && c !== false));
  return el;
}

const pad = (n) => String(n).padStart(2, '0');

export function clock(date) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// "13:00" if today, "Mon 07:00" otherwise.
export function formatWhen(date, now = new Date()) {
  return date.toDateString() === now.toDateString() ? clock(date) : `${DAY_NAMES[date.getDay()]} ${clock(date)}`;
}

export function formatDuration(ms) {
  const mins = Math.max(1, Math.ceil(ms / 60_000));
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  const rest = mins % 60;
  if (hours < 24) return rest ? `${hours} h ${rest} min` : `${hours} h`;
  const days = Math.floor(hours / 24);
  return `${days} d ${hours % 24} h`;
}

export function statusText(status, now = new Date()) {
  switch (status.state) {
    case 'off':
      return 'Disabled';
    case 'allowed':
      return 'Allowed now';
    case 'pass':
      return `Pass · ${formatDuration(status.passUntil - now.getTime())} left`;
    case 'blocked':
      return status.until ? `Blocked until ${formatWhen(status.until, now)}` : 'Blocked';
    default:
      return '';
  }
}

export function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  h('a', { href: url, download: filename }).click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function today() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
