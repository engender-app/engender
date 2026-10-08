# Update handover regression

Run `node tests/update-handover-check.mjs`, or `npm run test:browser`.
The runner starts its own Vite server and Chromium context per scenario.

The probe uses the production update handler, busy owner, journal write
wrapper and encrypted SQLite driver. It holds an entry insert inside a real
transaction. A fixture worker delays the production skip-waiting listener
until the runner releases it, allowing takeover and timeout to be ordered
against that write. Success must reach the save caller before a real page
reload, and the committed note must survive reopening the encrypted journal.
An injected SQL failure must roll back, preserve the caller's error and draft,
and allow a successful save followed by an explicit update retry.

This does not exercise the full release worker's precache installation or
asset replacement; `npm run verify:build` covers that worker. Firefox, Safari,
mobile browser lifecycle and physical-device behavior are not tested here.
Android installs updates through APK replacement rather than this worker path.
