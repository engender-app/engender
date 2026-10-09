# Update handover regression

Run `node tests/update-handover-check.mjs`, or `npm run test:browser`.
The runner starts its own Vite server and Chromium context per scenario.
The `update-handover` browser CI matrix entry runs the same checks.

The probe uses the production update handler, busy owner, journal write
wrapper and encrypted SQLite driver. It holds an entry insert inside a real
transaction. A fixture worker delays the production skip-waiting listener
until the runner releases it, allowing takeover and timeout to be ordered
against that write. Success must reach the save caller before a real page
reload, and the committed note must survive reopening the encrypted journal.
An injected SQL failure must roll back, preserve the caller's error and draft,
and allow a successful save followed by an explicit update retry.

The recovery page seeds an encrypted database with a future schema version
and a canary row. Production SQLite boot rejects it, the boot machine reaches
`schema-too-new`, and the real recovery component mounts without a ready or
setup registration. A worker installed on an earlier page can already be
waiting, or begin installing when recovery checks. The action must acquire
registration, wait for installation, activate that worker and reload. The
fixture records takeover before the reload and checks that the future schema
and canary row remain unchanged. Offline with a waiting worker can still
recover; offline without one reports failure and permits an online retry.
An online check with no release reports nothing newer and also permits retry.

The synthetic worker accepts the production skip-waiting protocol and claims
the page. It models an available release, but does not contain a newer app
that can open the future schema: the reloaded fixture still refuses it. These
checks prove discovery and handover, not release compatibility or a successful
journal open by a newer application.

This does not exercise the full release worker's precache installation or
asset replacement; `npm run verify:build` covers that worker. Firefox, Safari,
mobile browser lifecycle and physical-device behavior are not tested here.
Android installs updates through APK replacement rather than this worker path.
