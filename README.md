# Site Blocker

A personal Chrome extension that blocks chosen websites during scheduled times. See [SPEC.md](SPEC.md) for the full behaviour.

## Install (developer mode)

1. Open `chrome://extensions`.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and choose this folder.
4. Optional: pin the extension from the puzzle-piece menu so its popup is one click away.
5. Optional: under the extension's **Details**, turn on **Allow in Incognito**.

After editing the code, click the reload icon on the extension's card in `chrome://extensions`.

## Using it

- **Toolbar popup:** shows what is blocked right now and today's attempt count.
- **Block page:** write a reason for visiting and save it as a note. Taking a 5-minute pass requires a reason, which is saved as a note tagged **Unblocked**.
- **Notes** (popup → Notes, or the block page's Notes link): notes grouped by day, each with time, domain and reason. Delete a note with its ✕, or export them all as JSON.
- **Settings** (popup → Settings, or right-click the icon → Options):
  - **Sites:** turn each site on or off, edit its domains, choose its schedule, and add new sites.
  - **Schedules:** set days and blocked time ranges in 15-minute steps, and create extra named schedules.
  - **Data:** export or import settings as JSON, see blocked-attempt totals, and export the activity log.

## Files

| File | Purpose |
| --- | --- |
| `manifest.json` | Extension manifest (MV3) |
| `background.js` | Service worker: updates blocking rules, redirects open tabs, handles passes, logging and notes |
| `lib/core.js` | Schedule, domain and validation logic (no Chrome APIs) |
| `lib/ui.js` | Shared DOM and formatting helpers |
| `options.*`, `popup.*`, `blocked.*`, `notes.*` | Settings page, toolbar popup, block page, notes page |
| `tests/core.test.mjs` | Tests for `lib/core.js`: `node tests/core.test.mjs` |
