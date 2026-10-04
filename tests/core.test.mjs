// Run with: node tests/core.test.mjs
import assert from 'node:assert/strict';
import * as c from '../lib/core.js';

const s = c.defaultSettings();
const d = (str) => new Date(str); // local time
const yt = s.sites[1];

// 2026-10-05 is a Monday
assert.equal(d('2026-10-05T06:59').getDay(), 1);
assert.equal(c.siteStatus(yt, s, {}, d('2026-10-05T06:59')).state, 'allowed');
let st = c.siteStatus(yt, s, {}, d('2026-10-05T07:00'));
assert.equal(st.state, 'blocked');
assert.equal(st.until.toString(), d('2026-10-05T13:00').toString());
assert.equal(c.siteStatus(yt, s, {}, d('2026-10-05T13:30')).state, 'allowed');
st = c.siteStatus(yt, s, {}, d('2026-10-05T18:59:59'));
assert.equal(st.until.toString(), d('2026-10-05T19:00').toString());
assert.equal(c.siteStatus(yt, s, {}, d('2026-10-05T19:00')).state, 'allowed');
assert.equal(c.siteStatus(yt, s, {}, d('2026-10-10T10:00')).state, 'allowed'); // Saturday

// Passes
const now = d('2026-10-05T08:00');
assert.equal(c.siteStatus(yt, s, { [yt.id]: now.getTime() + 1000 }, now).state, 'pass');
assert.equal(c.siteStatus(yt, s, { [yt.id]: now.getTime() }, now).state, 'blocked');

// Disabled and Always
assert.equal(c.siteStatus({ ...yt, enabled: false }, s, {}, now).state, 'off');
st = c.siteStatus({ ...yt, scheduleId: 'always' }, s, {}, d('2026-10-10T03:00'));
assert.equal(st.state, 'blocked');
assert.equal(st.until, null);

// Back-to-back ranges spanning two days lift at the end of the combined block
const sch = { id: 'x', name: 'x', days: [1, 2], ranges: [{ start: '20:00', end: '24:00' }, { start: '00:00', end: '02:00' }] };
assert.equal(c.blockedUntil(sch, d('2026-10-05T21:10')).toString(), d('2026-10-06T02:00').toString());

// Domains
assert.equal(c.normaliseDomain('https://www.YouTube.com/watch?v=1'), 'youtube.com');
assert.equal(c.normaliseDomain('Forum.grin.mw'), 'forum.grin.mw');
assert.equal(c.normaliseDomain('localhost'), null);
assert.equal(c.normaliseDomain('not a domain'), null);
assert.deepEqual(c.parseDomainList('x.com, twitter.com x.com bad'), { domains: ['x.com', 'twitter.com'], invalid: ['bad'] });
assert.ok(c.hostMatches('m.youtube.com', 'youtube.com'));
assert.ok(!c.hostMatches('notyoutube.com', 'youtube.com'));
assert.ok(!c.hostMatches('google.com', 'mail.google.com'));
assert.equal(c.statusForHost('www.bbc.co.uk', s, {}, now).site.domains[0], 'bbc.co.uk');
assert.equal(c.statusForHost('example.com', s, {}, now), null);

// Import validation
assert.deepEqual(c.validateSettings(JSON.parse(JSON.stringify(s))), s);
assert.throws(() => c.validateSettings({ schedules: [], sites: [] }), /default/);
const badRange = (start, end) => ({ ...s, schedules: [{ ...s.schedules[0], ranges: [{ start, end }] }] });
assert.throws(() => c.validateSettings(badRange('10:00', '09:00')), /range/);
assert.throws(() => c.validateSettings(badRange('10:10', '11:00')), /range/);

console.log('All core tests passed.');
