# Android runner

`npm run test:android` builds and syncs the app, then runs instrumentation on
fresh disposable copies of the AVDs named by `ANDROID_TIER_AVDS` (default
`gd26,tracker35`). Existing AVD data and other connected devices are untouched.
Startup checks the port, watches the launched process, and verifies the unique
disposable AVD name before device operations. Shutdown checks the same identity
and waits for the owned process to exit. Every adb operation selects the owned
serial, and Gradle receives that serial
through `ANDROID_SERIAL`. Choose an unused even port with `ANDROID_TIER_PORT`
(default 5580). `ANDROID_TIER_HEADLESS=1` uses software graphics without Vulkan.

Each run retains invocation logs, stage logs and disposable AVD files in a new
directory under `.claude/android-tier/`. `ANDROID_TIER_LOG_DIR` overrides that
parent directory. XML results are cleared before each invocation. Missing,
malformed or incomplete results fail. A nonzero exit, signal, startup error or
timeout still fails when partial passing XML exists. Optional skips print SKIP.

Gradle removes the packages after the bulk run, so the runner reinstalls both
built APKs before the PIN-wait exercise. The exercise runs on each emulator:
seed, force-stop, confirm
that the app process is absent, restore, then cleanup. No reinstall or state
reset occurs between seed and restore. Restore requires a different process
ID and process token, the same boot, and the exact persisted elapsed deadline.
Raw stage success requires one started and completed test plus the terminal
instrumentation result. Stage skips and failures fail the command. Process logs preserve the IDs,
tokens and remaining delay.

Parser and invocation regressions run in the Node tier through
`tests/android-tier/instrumentation.test.ts`.

## Persistent automatic backups

The standard runner also runs `NativeBackupSchedulingTest` in separate required
phases. It prepares an encrypted Archive with two MiB of attachments and 3300
rows using the existing TypeScript codec, closes the page, then kills the
background app process or reboots the disposable emulator. WorkManager delivers
the due Archive through a real test DocumentsProvider. Verification establishes
the native success and snapshot timestamps before opening a page to restore it
through the public Archive reader. The provider supports destination failures;
it is test storage, not a personal folder. No fake clock drives the native job.

A separate no-stage exercise records deferral with no journal open. Force-stop
is exercised separately and must leave the package stopped and its process
absent after the due time. Cleanup cancels unique work and deletes encrypted
staging. All stage failures remain failures in the aggregate result.

Use `ANDROID_TIER_BACKUP_ONLY=1 ANDROID_TIER_AVDS=tracker35 npm run test:android`
for the same backup stages without unrelated native suites. API 26's bundled
WebView cannot produce the Archive; the runner reports that skip explicitly.
The no-stage native deferral exercise still runs there.

For an affected-phase rerun, set `ANDROID_TIER_BACKUP_STAGES` to a comma-separated
list, for example `defer,verify-deferred,catch-up,cleanup`. The report names the
selection. Unknown stages and selected stages that never execute fail the run;
unselected stages are explicit skips. Omit the variable for the full roster.

## Locked journal after process death

Run `ANDROID_TIER_LOCK_ONLY=1 ANDROID_TIER_AVDS=tracker35 npm run test:android`
for the opt-in lock probe. It builds an isolated `dev.engender.app.test.lockprobe`
package on a disposable emulator. The fixture uses the production PIN setup and
journal stores. Before each kill, it unlocks and visits Today, Calendar, Look
back and More. It backgrounds the app, waits for its lock, runs `am kill`, and
requires the process to disappear. Recents, the launcher and a posted reminder
notification each return to a new process. Each arrival must show the PIN pad
and contain no fixture text anywhere in the DOM, including hidden retained
doors and form values. The reminder uses the production notification builder
and authenticated PendingIntent. It does not substitute a route URL for a
notification tap.

The fixture helper is excluded from the ordinary instrumentation roster. This
stage needs a supported WebView; selecting the native-only API 26 AVD fails.
Invocation failures and missing arrival controls fail the command. The runner
removes its forwards and isolated packages, then shuts down its owned emulator.
Its evidence includes process IDs and one result for each arrival. This checks
process death on an emulator, not permission revocation or physical-device
behavior.

## Release evidence

Start from a clean working tree. A passing run writes `androidTier` in
`scripts/progressive-release-record.json` after checking that HEAD and the
working tree stayed unchanged. It records each AVD, serial, API, APK hashes,
completed stage groups and individual passing checks. Failed runs do not write
passing evidence. Commit the record before tagging or running another tier.
Tagging and publication require the API 26 and current-Android core rosters;
focused runs cannot satisfy that requirement. The current-Android roster also
requires fresh English and Polish OCR in airplane mode. The runner builds an
isolated package for this phase, records its APK hashes separately, and restores
network settings and removes both packages when the phase ends or fails.
`offline-ocr-stage.mjs` owns this phase for both the core and standalone runners.

`optionalStages.installedUpgrade` and `optionalStages.lockedProcessDeath` are
explicitly absent until their stages complete. A focused lock run can add its
completed result to earlier core evidence only when both runs used equivalent
source. The installed-upgrade stage remains unavailable until its runner lands.
The release workflow reads the committed record from the publication checkout.
