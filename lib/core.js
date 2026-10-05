// Pure scheduling and domain logic, shared by the service worker and all pages.

export const PASS_MINUTES = 5;
export const ALWAYS_ID = 'always';
export const DEFAULT_SCHEDULE_ID = 'default';
export const MAX_LOG_ENTRIES = 10000;
export const MAX_NOTE_LENGTH = 1000;
export const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
// Display order for day pickers (Monday first).
export const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

// 00:00, 00:15, ... 23:45, 24:00
export const TIME_OPTIONS = Array.from({ length: 97 }, (_, i) => fromMinutes(i * 15));

const ALWAYS_SCHEDULE = Object.freeze({
  id: ALWAYS_ID,
  name: 'Always',
  days: [0, 1, 2, 3, 4, 5, 6],
  ranges: [{ start: '00:00', end: '24:00' }],
});

const DEFAULT_SITES = [
  ['bbc.co.uk'],
  ['youtube.com', 'youtu.be'],
  ['facebook.com', 'fb.com'],
  ['instagram.com'],
  ['x.com', 'twitter.com'],
  ['linkedin.com', 'lnkd.in'],
  ['tradingview.com'],
  ['forum.grin.mw'],
  ['mail.google.com', 'gmail.com'],
  ['coinmarketcap.com'],
];

export function defaultSettings() {
  return {
    version: 1,
    schedules: [
      {
        id: DEFAULT_SCHEDULE_ID,
        name: 'Default',
        days: [1, 2, 3, 4, 5],
        ranges: [
          { start: '07:00', end: '13:00' },
          { start: '14:00', end: '19:00' },
        ],
      },
    ],
    sites: DEFAULT_SITES.map((domains) => ({
      id: crypto.randomUUID(),
      domains,
      enabled: true,
      scheduleId: DEFAULT_SCHEDULE_ID,
    })),
  };
}

export function toMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

export function fromMinutes(n) {
  return `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
}

export function isValidTime(t) {
  return TIME_OPTIONS.includes(t);
}

// "https://www.YouTube.com/watch?v=1" -> "youtube.com"; returns null if not a valid domain.
export function normaliseDomain(input) {
  let s = String(input ?? '').trim().toLowerCase();
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, '');
  s = s.split(/[/?#]/)[0];
  s = s.replace(/^.*@/, '').replace(/:\d+$/, '').replace(/\.$/, '').replace(/^www\./, '');
  const valid = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9-]{2,63}$/.test(s);
  return valid ? s : null;
}

// Splits user input on commas/whitespace. Returns unique valid domains and the invalid entries.
export function parseDomainList(text) {
  const parts = String(text ?? '').split(/[\s,]+/).filter(Boolean);
  const domains = [];
  const invalid = [];
  for (const part of parts) {
    const d = normaliseDomain(part);
    if (!d) invalid.push(part);
    else if (!domains.includes(d)) domains.push(d);
  }
  return { domains, invalid };
}

export function hostMatches(host, domain) {
  host = host.toLowerCase().replace(/\.$/, '');
  return host === domain || host.endsWith(`.${domain}`);
}

export function hostFromUrl(url) {
  try {
    const u = new URL(url);
    return /^https?:$/.test(u.protocol) ? u.hostname.toLowerCase() : null;
  } catch {
    return null;
  }
}

export function siteLabel(site) {
  return site.domains.join(', ');
}

export function getSchedule(settings, id) {
  if (id === ALWAYS_ID) return ALWAYS_SCHEDULE;
  return (
    settings.schedules.find((s) => s.id === id) ??
    settings.schedules.find((s) => s.id === DEFAULT_SCHEDULE_ID) ??
    settings.schedules[0]
  );
}

export function isActiveAt(schedule, date) {
  if (!schedule.days.includes(date.getDay())) return false;
  const mins = date.getHours() * 60 + date.getMinutes();
  return schedule.ranges.some((r) => toMinutes(r.start) <= mins && mins < toMinutes(r.end));
}

// The first 15-minute boundary strictly after `now`.
export function nextBoundary(now) {
  const t = new Date(now);
  t.setSeconds(0, 0);
  t.setMinutes(Math.floor(t.getMinutes() / 15) * 15 + 15);
  return t;
}

// When an active schedule stops blocking, following back-to-back ranges and days.
// Returns null if it never stops within a week (e.g. "Always").
export function blockedUntil(schedule, now) {
  const t = nextBoundary(now);
  for (let i = 0; i <= 7 * 96; i++) {
    if (!isActiveAt(schedule, t)) return t;
    t.setMinutes(t.getMinutes() + 15);
  }
  return null;
}

// state: 'off' | 'allowed' | 'blocked' | 'pass'
export function siteStatus(site, settings, passes = {}, now = new Date()) {
  const schedule = getSchedule(settings, site.scheduleId);
  if (!site.enabled) return { state: 'off', schedule };
  if (!isActiveAt(schedule, now)) return { state: 'allowed', schedule };
  const until = blockedUntil(schedule, now);
  const passUntil = passes[site.id];
  if (passUntil > now.getTime()) return { state: 'pass', schedule, until, passUntil };
  return { state: 'blocked', schedule, until };
}

const STATE_RANK = { off: 0, allowed: 1, pass: 2, blocked: 3 };

// The most restrictive status among the site entries matching `host`, or null if none match.
export function statusForHost(host, settings, passes = {}, now = new Date()) {
  let best = null;
  for (const site of settings.sites) {
    if (!site.domains.some((d) => hostMatches(host, d))) continue;
    const status = { ...siteStatus(site, settings, passes, now), site };
    if (!best || STATE_RANK[status.state] > STATE_RANK[best.state]) best = status;
  }
  return best;
}

// Local calendar day as "YYYY-MM-DD".
export function dayKey(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// Groups notes by local day, newest day first and newest note first within each day.
export function groupNotesByDay(notes) {
  const days = new Map();
  for (const note of [...notes].sort((a, b) => b.ts.localeCompare(a.ts))) {
    const key = dayKey(new Date(note.ts));
    if (!days.has(key)) days.set(key, []);
    days.get(key).push(note);
  }
  return [...days].map(([day, dayNotes]) => ({ day, notes: dayNotes }));
}

// Validates and normalises imported settings. Throws an Error with a readable message.
export function validateSettings(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('Not a settings object.');
  if (!Array.isArray(raw.schedules) || !Array.isArray(raw.sites)) {
    throw new Error('Missing "schedules" or "sites" list.');
  }

  const schedules = raw.schedules.map((s, i) => {
    const where = `Schedule ${i + 1}`;
    if (typeof s?.id !== 'string' || !s.id || s.id === ALWAYS_ID) throw new Error(`${where}: invalid id.`);
    const days = [...new Set((s.days ?? []).map(Number))]
      .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
      .sort((a, b) => a - b);
    const ranges = (s.ranges ?? []).map((r) => {
      if (!isValidTime(r?.start) || !isValidTime(r?.end) || toMinutes(r.start) >= toMinutes(r.end)) {
        throw new Error(`${where}: invalid time range ${r?.start}–${r?.end}.`);
      }
      return { start: r.start, end: r.end };
    });
    return { id: s.id, name: String(s.name ?? '').trim() || 'Untitled', days, ranges };
  });

  const ids = new Set(schedules.map((s) => s.id));
  if (ids.size !== schedules.length) throw new Error('Duplicate schedule ids.');
  if (!ids.has(DEFAULT_SCHEDULE_ID)) throw new Error('The "default" schedule is missing.');

  const sites = raw.sites.map((s, i) => {
    const domains = [...new Set((s?.domains ?? []).map(normaliseDomain))];
    if (!domains.length || domains.includes(null)) throw new Error(`Site ${i + 1}: invalid domains.`);
    const scheduleId = s.scheduleId === ALWAYS_ID || ids.has(s.scheduleId) ? s.scheduleId : DEFAULT_SCHEDULE_ID;
    const id = typeof s.id === 'string' && s.id ? s.id : crypto.randomUUID();
    return { id, domains, enabled: s.enabled !== false, scheduleId };
  });

  return { version: 1, schedules, sites };
}
