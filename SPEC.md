# Site Blocker — Specification

A personal Chrome extension (Manifest V3) that blocks chosen websites during scheduled times.
It is deliberately low-friction: it can be disabled or edited at any time, and a 5-minute pass is one click away.

## Sites

- Each site entry has one or more domains, an on/off toggle and an assigned schedule.
- A domain also covers all its subdomains (`youtube.com` blocks `www.youtube.com`, `m.youtube.com`, …).
- Domains are normalised on entry: `https://www.YouTube.com/watch` → `youtube.com`.
- Only top-level page visits are blocked. Content embedded in other sites (e.g. YouTube videos, TradingView charts) still loads.
- Sites can be added, edited and removed.

Default sites (all enabled, all on the Default schedule):

| Site            | Domains                         |
| --------------- | ------------------------------- |
| BBC             | `bbc.co.uk`                     |
| YouTube         | `youtube.com`, `youtu.be`       |
| Facebook        | `facebook.com`, `fb.com`        |
| Instagram       | `instagram.com`                 |
| X               | `x.com`, `twitter.com`          |
| LinkedIn        | `linkedin.com`, `lnkd.in`       |
| TradingView     | `tradingview.com`               |
| Grin forum      | `forum.grin.mw`                 |
| Gmail           | `mail.google.com`, `gmail.com`  |
| CoinMarketCap   | `coinmarketcap.com`             |

## Schedules

- A schedule has a name, days of the week, and one or more time ranges during which sites are **blocked**.
- Times are in 15-minute steps from 00:00 to 24:00. A range must end after it starts on the same day (no ranges crossing midnight).
- Any number of named schedules can be created (e.g. "Default", "Custom 1", "Evenings").
- The Default schedule cannot be deleted. Deleting another schedule moves its sites to Default.
- A site may also use the built-in **Always** option, which blocks at all times.
- Default schedule out of the box: Monday–Friday, 07:00–13:00 and 14:00–19:00.

## Blocking behaviour

- Navigating to a blocked site redirects to the block page.
- When a block starts, any tabs already open on that site switch to the block page immediately.
- The block page shows the domain, the schedule that is blocking it, and when the block lifts (time and countdown).
- **5-minute pass:** one click, no confirmation, unblocks that site entry for 5 minutes and returns to the page. When the pass expires, open tabs switch back to the block page.
- If a block lifts while the block page is open, it offers a "Continue to site" button.

## Activity log

- Every blocked visit and every pass is recorded with a timestamp, host, site entry and schedule name.
- Reloading the block page and the automatic switch of already-open tabs are not counted as attempts.
- The settings page shows totals per host and can export the full log as a single JSON file, or clear it.
- The log keeps the most recent 10,000 entries.

## Settings import/export

- All sites and schedules can be exported to a JSON file and imported again (replacing current settings after confirmation).
- Imported files are validated; invalid files are rejected with a message.
- Settings are stored locally only (no Chrome sync).

## Pages

- **Popup** (toolbar icon): current status of every site, today's attempt count, link to settings.
- **Settings page**: tabs for Sites, Schedules, and Data (import/export, activity).
- **Block page**.

## Installation

Loaded unpacked via `chrome://extensions` in Developer mode. See README.md.
