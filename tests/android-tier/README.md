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

The emulator runs with metrics and crash reporting disabled for that process,
so a previous emulator crash cannot block startup on a consent dialog.

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

## Optimized instrumentation

Run `ANDROID_TIER_R8=1 npm run test:android` for the complete optimized tier.
The runner builds and installs `dev.engender.app.test.r8`, uses the optimized
variant for every stage including isolated offline OCR, and records that
variant's APK hashes. Omitting `ANDROID_TIER_R8` retains the debug tier.
The same switch also applies to the optional lock, recovery and backup runs.

`r8.init.gradle` defines the opt-in `r8Instrumented` build type. It copies the
release settings and ProGuard rules, uses local debug signing, and keeps R8 in
release mode. It requires isolated application and test package IDs under
`dev.engender.app.test.` and rejects configuration with the production package.
The generated app and test manifests enable `run-as` and authenticate the test
provider after processing; setting
the build type itself to debuggable would disable R8 optimizations. Run the
artifact guard against `app/build/outputs/mapping/r8Instrumented/mapping.txt`
to check that helpers were obfuscated.

Fault-injection tests need the existing debug `BackupProviderCapability`, which
accepts only the installed instrumentation provider. The init script selects
that one source file for this test variant. Production release builds keep the
release implementation, which refuses instrumentation providers. A full run on
this variant proves the optimized fault-injection tier; it does not prove
delivery through a production release APK. Release provider refusal and delivery
through Android's supported local provider need separate release controls.

For an isolated APK built from the production `release` source set, run
`BackupDeliveryDurabilityTest#releaseRefusesInstrumentationProviderForForegroundAndWorker`
with instrumentation argument `releaseProviderRefusal=true`. It checks that
foreground delivery and the scheduled worker reject the instrumentation provider
with `destination-durability-unavailable`, remove partial documents, and publish
no backup success. Verify the installed release APK hash before invocation;
the test skips without the explicit argument. That skip supplies no
release-provider evidence.

The test APK uses the normal AndroidX dependency graph. Shipped member-level
rules preserve its calls into shared runtime classes, while AGP applies the app's
name mapping. Test-only ProGuard rules suppress the optional coroutine screenshot
adapter and compile-only types outside this tier. The app shrinker does not use
those suppressions.

The opt-in [`test:android:upgrade` stage](installed-upgrade.md) installs a
candidate over a filled rc.1 synthetic package on a named emulator. It compares
the journal, media, SQLite and alarms, rejects a row-deleting control, and checks
failed-migration recovery. Its kit command rebuilds all four APKs and the old
Archive fixture from source; historical APKs are not needed.

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

The API 26 runner disables the emulator's GLDMA transport. Its old goldfish
kernel panics while mapping graphics DMA buffers during Android startup.
The native floor checks run after a fresh boot with that transport disabled.

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
A CDP-only installed-upgrade run records four application APKs: the released
rc.1 build, the healthy candidate, and the two named migration controls. Each
APK has its actual SHA-256, source revision, package ID and version metadata;
control APKs also name their fixture patch. The healthy APK hash must match the
run's target hash, and its source and both control sources must match the tested
revision. Core and other instrumentation runs retain their test-APK hashes.
An installed-upgrade result alone leaves the required core roster incomplete.
The release workflow reads the committed record from the publication checkout.
