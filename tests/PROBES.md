# Verification probes and focused regressions

`npm run build && node tests/manager-lifecycle-check.mjs` opens both entry
managers, leaves through navigation and browser Back, and checks they stay
closed. It also covers ordinary focus return, Quick add
cleanup and web lock/unlock. Pass an emulator serial and an isolated
`dev.engender.app.test.<suffix>` package to repeat the check in its production
APK, including Android Home/resume and hidden retained doors. The web check
also runs in the browser tier.

`node tests/old-addresses-check.mjs` opens all 52 retired route addresses in
the built app. After unlocking, each must render the unknown-address screen
with a link to Today.

`node tests/language-confirm-check.mjs` opens the real Settings Language sheet.
Two Right presses must leave System selected and the English locale loaded,
without reloading. Enter then applies Polish; Space applies English and a
touch applies Polish. Each choice is checked again after the resulting reload.
The check runs in `npm run test:browser`.

`VITE_DEMO=1 npm run build && node tests/completed-history-check.mjs` drives
the built SPA through real links, saves, deletes and browser Back. It checks
custom scales, existing and new reminders, new and edited tryouts and
documents. Ordinary Back and draft discard retain their opener.
The custom-scale Save/Back assertion fails on the old code by reopening
`/settings/dimension`. No history or navigation function is mocked.

`browser-tier/focus-swaps.mjs` presses Enter through Today editing, access-mode
steps, recovery-key creation/replacement/revocation, Trash and Notice
removals. It checks named active elements, empty-list fallbacks and preserved
Tab stops with full and reduced motion. `browser-tier/focus-arrival.mjs` drives
first run and a cold unlock through the complete production shell. Both run in
the browser tier. Run either script directly for its focused check.
`android-tier/focus-arrival.mjs` repeats cold unlock in an isolated test APK,
then visits retained doors and checks that navigation and Today editing focus
only the active door. Pass a device serial and the isolated package name.

`browser-tier/trash-restore.mjs` taps Restore on the real Trash screen with
the journal's restore held open, rejected and let through. A double tap writes
once, a failure keeps the row and raises the catalogued toast, and a retry
lands. It samples every row on each animation frame: under full motion the
restored row and, for the last row, the whole list must close over several
frames with no neighbour jumping, and under reduced motion both cut. It runs in
the browser tier; pass `--dump <dir>` when running it directly to keep the
frame samples.

The browser tier's `entry-contextual-text.mjs` types `felt like me` key by key
into the real entry editor over encrypted SQLite, for new and existing entries.
It checks spaces and recovery-note line breaks before saving, trimmed saved
values, and deletion of a typed recovery note before saving.
`entryDraft.test.ts` checks that save normalization leaves draft text intact.

The browser tier's entry editor probe (`entry-editor-probe.ts`) also finishes a
new entry from its first step: a face alone saves that mood and nothing else,
and a face plus one moved scale saves exactly that scale, read back out of
SQLite (tester report 02 ticket 03). Its older cases continue to the second
step first, where the note, the template button and the star now are.
Tester report 02 ticket 04 adds the second step: a save from it writes what
both steps set (a mode, a tag chosen with no chip opened, the note, the star),
its parts stand in the order mode, tags, body, note, photos, video, voice, a
step back keeps the face and the note, and the finish control is one element
across both steps. The walkthrough's `second step of a new entry` flow holds
the same through the built app.

`src/lib/permissions/watchStatus.test.ts` checks the permission-status watcher
that Reminders, Notifications and the permissions list share: a re-read when
the page becomes visible, a refused read shown as the caller's unreadable
value rather than a remembered answer, the newest read winning over an older one that answers
last, and no listener or late answer after teardown. Removing any one of
those rules fails one test. The source checks in `reminders-surfaces.test.ts`,
`unprompted-view.test.ts` and `settings-surfaces.test.ts` hold each screen to
the watcher, Reminders to one notice per refused permission, and both
screens to a could-not-check notice with Try again when the read itself fails. Grant-and-return
on Android was shown on an API 35 emulator: the old build kept each notice
after the grant, the fixed build removed it on return. Two tests in
`src/lib/motion/reveal.test.ts` hold a notice arriving behind a leaving one
to the top margin it will have in that place; on the emulator the swap
between "Could not check permissions" and "Notifications are off" had ended
20px off and jumped in one frame, and now ends at rest.

`npm run test:android:upgrade -- <serial> <avd> <manifest>` runs the opt-in
[installed-upgrade stage](android-tier/installed-upgrade.md) on a named isolated
emulator. It compares a filled rc.1 journal before and after the candidate,
rejects a measurement-deleting control, and restores the saved copy after the
retained milestone-deleting migration fails. The kit command rebuilds all APKs
and a released-format synthetic Archive. `installed-upgrade-state.test.ts` checks
the comparison's refusal cases; `android-failed-migration.test.ts` remains the
single closed-session fake-plugin recovery regression. The shared Android record
lists only stages and checks that actually completed.

Archive validation tests cover single-read export length changes, malformed
payloads, empty files and trailing plaintext (`codec.test.ts`), refusal kinds,
positive header fields and exact JSON/chunk ceilings (`container.test.ts`),
and v1 preset migration without a presets section (`payload.test.ts`). The
existing `kdf-cost-cap.test.ts` keeps the KDF refusal proof.
`archive-row-validation.test.ts` checks corrupt classification before storage
access for missing references, invalid stored values, repeated identities and
template tags. In Merge and Replace it checks unchanged row counts, content
hash and file bytes. `restore.test.ts` injects a failure before commit with
valid rows to keep rollback coverage. Strict typed runs in
`tests/fuzz/fuzz.test.ts` exercise encrypted Archive mutations with Node SQLite
and a fake file store; they do not cover Android drivers or the browser flow.

`src/lib/data/archive/header-shape.test.ts` sends the retained JSON `null`
header frame and other non-object headers through `openArchive`. Corrupt-file
classification must precede key derivation. Newer and invalid format versions
keep their existing unsupported-file classifications.

`JournalWebViewInputTest` focuses real note, text, search and password controls
in MainActivity's WebView and reads their native input connections. Each must
carry `IME_FLAG_NO_PERSONALIZED_LEARNING`, while multiline input and keyboard
actions remain intact. It runs in the Android tier on a supported WebView;
the native-only selection on the old API 26 image excludes WebView probes.

Keyboard learning needs a separate physical check with a phone lease and an
isolated test package. With FUTO, first check that a fresh synthetic word is
absent from another app's suggestions. Type it three times through the actual
on-screen keyboard in the entry note, then check that the other app offers it.
With the repaired build, repeat with a different fresh word and require it to
remain absent. Remove only the test's own learned word and restore any changed
settings; never reset the keyboard dictionary. Retain only synthetic matches,
not unrelated suggestions. FUTO behavior does not prove what other keyboards
do with this advisory flag.

`node tests/android-insets/run.mjs <emulator-serial> <output-directory>`
checks Home, the entry editor and a template sheet in the isolated demo package.
Its API 33/35/36 matrix uses Android gesture/three-button navigation, trans
light/dark, native cutout overlays, rotation and the actual IME. Native window
insets and WebView bounds must leave header content and actions clear; the
editor footer must stay above the keyboard, with a complete typed note line
visible and navigation restored after keyboard dismissal. Each case retains screenshots,
top/bottom crops and geometry before assertions. See [Android inset matrix](android-insets/README.md)
for build, isolation and cleanup. This does not establish Play notice removal
or physical-device timing. The existing `safe-area.test.ts` remains a declaration
check, not a substitute for the native matrix.

`auto-export-scheduler.test.ts` reports one synthetic native backup failure
across ticks and a fresh scheduler module with the same stored preferences.
It checks quiet-hours holds, notification refusal, disabled notices, clock
correction and new failures after success or destination changes.
`preferences.test.ts` reopens real SQLite to verify the receipt and held flag;
`catalogue.test.ts` keeps the receipt out of Archives and the boot mirror.

`node tests/entry-capture-check.mjs` drives the real entry routes and lock
shell in Chromium with synthetic camera and microphone tracks. EN/PL keyboard
activation, duplicate taps, navigation and actual visibility-triggered PIN
concealment must leave no recorder, live track, preview or delayed feedback.
`--gallery` records the pending controls beside their idle state in the trans
palette, light and dark. It checks stable control geometry and retained focus.
The browser tier's `entry-capture-probe.ts` mounts production EntryEditor over
encrypted SQLite and attachment storage. It checks cancelled late opens,
recorder failures, refusal retries, saved playback and the actual 30-second
video cap. Node capture tests check failure cleanup and cap timer ownership.

`src/lib/data/sqlite/migration-runner.test.ts` checks that the FTS5 probe
actually attempts a virtual-table creation before reading versions or copying
files. Wrapped driver errors keep their cause and fail as unavailable FTS5.
Repeated probes leave no temporary tables and never change the main schema.

`KeystorePromptLifecycleTest` calls the real Android unlock and confirmation
paths with saved fragment state. Both must answer without a key; an invalid
modern prompt must reject instead of leaving its call pending. These checks
run in the Android tier, including its native-only emulator selection.

`node tests/android-tier/key-gate/run.mjs --resources <owned-emulator.json>
--output <evidence-directory>` requires an isolated test package, an owned
emulator with synthetic PIN 1234 and enrolled fingerprint 1, and the built
`key-gate` probe and APKs. It seeds a real encrypted journal, cold-launches
its production boot and gate, presses Home, and mounts the gate only after
native fragment state is saved. The existing cancelled state must enable
retry; a real fingerprint then reopens the saved entry. Ordinary cancel and
fingerprint lockout must also release busy. The runner captures the gate
in trans light and dark. Only mount timing is controlled; the native bridge,
Keystore, journal and gate remain production code. Resources name `serial`,
`avd`, emulator `pid`, isolated `package` and an owned `cdpPort`. The runner
clears only that package and removes its own forward when finished.

`tests/fuzz/fuzz.test.ts` runs in `npm test` without a new dependency. Seed 1
produces 40 cases for each of 8 targets: five Archive variants, Daylio CSV,
Daylio backup and sniffers.
`FUZZ_LONG=1 FUZZ_SEED=7 npm test` runs 2,000 cases per target. To run only
the harness, use `npx vitest run tests/fuzz/fuzz.test.ts`. `FUZZ_COUNT`,
`FUZZ_LONG_COUNT` and comma-separated `FUZZ_TARGETS` narrow diagnostic runs.
The browser photo/PDF targets are outside this Node harness.

Each child has a 1 GiB heap cap and a 30-second case watchdog. Environment
overrides can lower these bounds, never raise them. A crash, timeout, changed
row or file content after refusal, orphan surviving the sweep, failed SQLite
integrity check, unreadable accepted snapshot, prototype pollution or throwing
sniffer fails the test. Untyped refusals stay in the summary without failing
unless `FUZZ_STRICT_TYPED=1`. There is no corrupt-input signature allow-list.
`invariants.test.ts` plants partial writes, changed file bytes, orphan survivors,
broken foreign keys and unreadable rows, plus sniffer throws and pollution.

`FUZZ_OUT` selects the output directory, defaulting to ignored `ci-logs/fuzz/`.
Summaries include seed, counts, wall time, child CPU time and peak RSS. Each
defect or untyped refusal keeps a `case-seed<seed>-<target>-<index>.json`
receipt and its exact `.bin` input. A killed child keeps the active input;
startup or generation failures have a receipt without an input. Replay a saved
receipt from the repository root with:

```sh
node --max-old-space-size=1024 tests/fuzz/child.mjs '{"root":".","artifact":"/absolute/path/case-seed1-daylio-csv-0.json","run":true}'
```

The retained `replay: "target:index"` option regenerates a case from its seed.
Encrypted framing uses fresh nonces, so only an artifact replay reproduces the
exact bytes. The optional shrinker cuts ciphertext and cannot meaningfully
minimise encrypted targets. A future LAN receiver adds its damaged-frame target
with the same refusal fingerprint rule when that receiver lands.

`node tests/reset-restart-check.mjs` uses an isolated persistent Chromium
profile and SIGKILLs only its owned process group at testing-09 seeds
6501 through 6530, within 160 ms of the reset action. Erased cuts must return
to onboarding with no old app-owned mirrors or preference projection.
Interrupted partial-data cases are recorded separately and must retain an
explicit recovery action. A persisted old-mirror control checks the boot
boundary even when a particular crash happens after browser storage flushes.
Unrelated origin storage must survive. `reset.test.ts` checks credential-last
file deletion and refusal ordering; `boot-machine.test.ts` keeps cleanup on
the absent-journal path.

`release-switch.test.ts` drives the real operator against disposable release
roots. It checks active rollback history across deploy/rollback/deploy, list
markers and deploy messages, stale timestamps, missing or invalid history,
schema refusal and same-current no-ops. Filesystem failure controls cover
history staging/publication, PDF publication and the current-link rename;
the old receipt, current target and exact retained PDF namespace must survive.

`webview-floor.test.ts` checks source JavaScript APIs, computed CSS transform
properties and selector syntax against `minWebViewVersion`. Its controls
cover direct and aliased style reads, bracket notation, shared selector
constants, and DOM `querySelector` and `matches` calls. It checks source
requirements rather than claiming to run a historical WebView engine.

`src/lib/data/journal/restore.test.ts` uses real SQLite to guard roadmap Merge
status separately from visibility. A hidden unchecked goal accepts the incoming
status, keeps the local hidden flag through repeated Merge, and retains the
status after unhiding and export/Replace. A locally recorded status still wins.

`src/lib/data/device-bound-journal.test.ts` exercises the production browser
adapters with fake OPFS and IndexedDB requests. A real passphrase wrap and
unlock prove the boot survey's leftover cleanup path. Removal failures keep
the next boot's retry marker; silent survivors, cancelled unlocks and a newer
device-bound mode cannot pass as completed cleanup. `journal-pin.test.ts`
checks that retrying the same published PIN verifies the active data key
without replacing its binding or wrap. These run in `npm test`.

`node tests/device-bound-cleanup-check.mjs` mounts the real Settings form in
Chromium. Forced metadata removal failures must show the existing incomplete
change notice and keep the passphrase or PIN retry available. A successful
retry removes both records; a separate real cold boot sweeps a recreated
leftover after secret authentication. The probe uses synthetic demo data.

`src/lib/data/sqlite/transactor.test.ts` limits real Node SQLite with
`max_page_count` to force SQLITE_FULL and its automatic rollback. The caller
must retain the full-disk message and original error cause, plus the refused
explicit rollback. Statement/commit controls keep both diagnostics, and the
next queued transaction must still commit.

`src/lib/data/spaceShortage.test.ts` drives the same SQLITE_FULL path and
checks that the refused rollback's AggregateError is still named a full
device. It also covers the Android ENOSPC wordings, a browser quota refusal,
the export bridge's `storage-full` and `destination-full` codes, and failures
that must stay unnamed. `StorageFailureTest` and `PhotoFilesTest` are the
JVM halves: which native failures get a code, when the export preflight may
refuse, and that a photo write failing after its open leaves no file. The
gates fixture's `boot-failure-storage-full` scene is checked by
`gates-say-what-happened` for its sentence and its retry.
The same gates probe enters a PIN after a forced ENOSPC credential read,
checks the free-space message and unchanged attempt count, then checks that
unavailable credentials and a wrong PIN keep their separate messages and
counting. `lock-timing-bridge.test.ts` checks that a native PIN admission
failure retains the storage cause for that classification.

`src/lib/data/archive/importer-refusals.test.ts` checks damaged ZIP containers,
malformed consumed JSON fields, Daylio PIN diagnostics and deferred attachment
refusals through the production importers. `importer-infrastructure.test.ts` injects failures
at decoder, parser and calendar boundaries and requires the original error to
reach the caller. Both run in the Node tier.

`tests/ai-directories.test.ts` plants synthetic root evidence in an isolated
Git repository. It requires index refusal and verifies that an archive of the
commit excludes evidence while retaining source, build inputs and intentional
fixtures. Editing checkout attributes after commit cannot change that receipt.

For isolated Daylio preview measurements, run
`DAYLIO_PREVIEW_BENCHMARK=1 npx vitest run src/lib/data/archive/daylioBackup-performance.test.ts`
on a quiet host. It reports three preview durations for each of 500, 1,000 and
2,000 stored 100 KiB JPEG attachments. Fixture creation and complete reads are
outside the measurement; counts, sniffing, stable identities and sampled
attachment content are asserted. Normal Node runs skip these large fixtures.

Every `.mjs` file directly under `tests/` is a guard, a gallery, or a helper
the other two import, plus `walkthrough.test` (`walkthrough.test.mjs`), which has its own npm
script and its own rules (ADR-0029). A probe written for one ticket's
sign-off does not stay by default. Either this file gets a line for it
before the ticket merges, or the probe is deleted before the merge.

The rule for keeping one, from phase 12 final-audit ticket 33: it guards
something a later ticket can break, or it proves a frame someone will look
at again. A probe that `src/` or a node test names as the source of a number
counts as the second kind, as long as it still runs. On 2026-09-23 that rule
sorted 201 files into 38 guards, 24 galleries and tools, 13 helpers and the
walkthrough, and 125 deletions. Deleted probes are still in history, and a
few kept files still name them as the source of a pattern:
`git log --all -- tests/<name>.mjs` finds the last version.

Most of these start their own Vite server or serve a build. Anything that
says "demo build" serves `build/`, which has to be a `VITE_DEMO=1` build. A
probe that takes `--root <built tree>` serves it through `previewBuild` in
browser-harness.mjs, which changes into that tree first (ticket 226) and
serves `build/index.html` itself under the production isolation headers
(`serve-build.mjs`, after-release ticket 31). Until then it was `vite
preview`, whose document had no CSP and no held module hints. A probe that
imports vite's `preview` directly, and the walkthrough, still get that
document.

CI's Node and Android jobs use `scripts/run-ci-checks.mjs`. Independent
checks continue after a failure; failed prerequisites leave named blocked
results. Browser fixtures, walkthroughs, installed PWA and hosting run in
separate jobs. The final required-checks job fails if any tier fails or is
blocked.

`journal-field-profile` (`tests/journal-field-profile.mjs`) types unique synthetic
canaries into the real entry note, tag and imported PDF title fields, closes
each independent Chromium and Firefox profile, then checks that raw, UTF-16
and base64 copies are absent. Firefox session files are decompressed before
scanning. Run `node tests/journal-field-profile.mjs` after runtime generation;
`--expect-leak` requires positive detection on an unprotected source baseline.
Profiles are removed after each field, including failures. This proves local
profile behavior, not keyboard learning or browser sync. `profile-canaries.py`
and `unmozlz4.py` are its scanner and Firefox decoder helpers.

`care-history` (`tests/care-history.mjs`) keeps typed drug names out of browser
history and session files. It drives the real Care screen, recorded-dose and
schedule marks, Log and Back in separate persistent Chromium and Firefox
profiles, then closes each browser and scans every profile file for raw,
URL-encoded and UTF-16 canaries. A separate profile carrying the former drug
URL must detect the canary, so an empty scan cannot pass by accident. Profiles
are synthetic and removed after each engine. Run `node tests/care-history.mjs`
after build/runtime generation, or name one engine. This proves local profile
behavior, not browser sync on another device.

`browser-tier/dose-slot-screens-probe.ts` runs through `test:browser` with a
synthetic encrypted journal and the real Today, Care and Transition screens.
It checks yesterday and today against a weekly patch slot: the Today panel and
pinned Care row, Care's next-dose statement and Transition's Care subtitle all
show the next uncovered week, and Today omits the covered patch prompt.
Query parameters support EN/PL, palette, light/dark and disguise rendering.
This proves rendered statements, not a physical-device session or a clinical
outcome. Domain, migration, Archive and eight zone-switch regressions live in
`src/lib/data/dose-slot-consistency.test.ts` and `sqlite/schema.test.ts`.

`retained-client-check` (`tests/retained-client-check.mjs`) switches two actual
built releases under retained Chromium pages, online and offline. Run
`node tests/retained-client/prepare.mjs <owned output>` to build A/B with
throwaway deferred-screen and SQLite-worker markers, then
`node tests/retained-client-check.mjs --a <output>/A --b <output>/B`.
Source markers are restored even when a build fails; remove the output afterward.
The check keeps admitted writes, drafts and failed-save recovery through A/B/A
takeover, visits the old licence screen for the first time, reopens its real
encrypted worker and checks current documents, cache reclamation and unrelated
caches. A held old receipt also checks that successor adoption follows the
outgoing event and protects a controlled pre-policy page. Each policy fixture has its own database name; one retained page also
runs the real production app and router. `--baseline-ref <ref>` substitutes that
ref's production worker owner for B and must fail the old-asset assertion on
an unfixed ref. PDF first-open and physical-device behavior remain outside this
probe. Unit cache and registration receipts run in the Node tier.

`update-handover-check` (`tests/update-handover-check.mjs`) runs with
`npm run test:browser`, or directly with `node tests/update-handover-check.mjs`.
Set `BROWSER_ENGINE=firefox` for Firefox. Navigation requires the fixture API
within 60 seconds. Recovery accepts same-URL interruptions only after schema
refusal at the requested URL. A held SQLite worker verifies delayed readiness and deadline failure.
It holds public journal writes against worker takeover and activation timeout,
checks encrypted persistence after reload, and preserves failed-write draft
recovery followed by an explicit update retry. Fixture and platform limits are
in [update-handover/README.md](update-handover/README.md).

`credential-change-check` (`tests/credential-change-check.mjs`) runs with `npm
run test:browser` and in its own required CI browser job. It holds credential
publication across a real Settings lock/unlock, rejects overlapping changes and
resets from both pages, then restarts and verifies the original entries and
encrypted attachment bytes. The dev app supplies synthetic demo data; credential
storage and UI paths are real.

`pin-credential-contention` (`tests/pin-credential-contention.mjs`) mounts the
real cold-start, session and current-PIN Settings gates in English and Polish.
It holds credential ownership, checks a correct PIN waits without changing the
throttle, then verifies successful unlock and one genuine wrong guess. A peer
changes or removes the wrap through production credential/file helpers; the
old gate must offer reopen guidance without another wrong attempt. Departure
and lock cancel queued publication. Error copy and live feedback are checked
at 390px and 200% CSS zoom. Run after build/runtime generation with
`node tests/pin-credential-contention.mjs`. SQLite, OPFS, IndexedDB and crypto
are real; visibility events and the held/faulted credential states are synthetic.
This does not establish physical-phone overlap frequency.

The same runner checks missing and deleted records through the real IndexedDB
adapter, persisted non-extractable HMAC signing, device-bound key loss and
older PIN wraps without a binding name. Each mounted gate also loses its
actual PIN binding: existing key-loss guidance must appear without changing
the attempt count or minting a key. The fixture restores its saved synthetic
key to prove journal bytes remain unchanged. `--adapter-only` runs just the
storage and compatibility checks.

`credential-power-cut` (`tests/android-tier/credential-power-cut.mjs`) drives the production Android PIN/passphrase change functions from a bundled WebView probe. It requires an owned temporary API-35 AVD and an isolated `dev.engender.app.test.*` package. It kills the owned QEMU process at 20 seeded offsets per credential type, then checks which credential opens the same SQLCipher record after boot. Half of each batch waits for the production change promise to resolve before cutting power; released OPFS adoption is exercised too. `CredentialWrapStoreTest` checks staged interruption, write failure, directory-sync failure and removal/adoption. The runner also injects post-rename directory-sync failure with real PIN/passphrase wraps, cuts QEMU, starts a separate instrumentation process, then verifies authority and the unchanged SQLCipher record. Use `--failure-restart` for just those combined cases. This proves the emulator's filesystem behavior, not a physical phone or web power-loss durability.

Build with `ANDROID_TIER_PROBE=credential-power-cut npx vite build --config tests/android-tier/android-tier.vite.config.ts`, after `npm run build && npx cap sync android`. Build app and instrumentation APKs with an isolated application ID, then supply `CREDENTIAL_POWER_CUT_AVD`, `CREDENTIAL_POWER_CUT_PACKAGE`, `CREDENTIAL_POWER_CUT_APK` and `CREDENTIAL_POWER_CUT_TEST_APK`. The runner owns only its supplied emulator process and CDP forward. Remove its test package and AVD after delivery.

`pin-count` (`tests/android-tier/pin-count/run.mjs`) mounts the production PIN
pad and authenticates a disposable native-bound PIN against a SQLCipher record.
It cuts the isolated app before unlock, after durable admission and after an
acknowledged wrong PIN, over fresh and already-durable counts. SIGKILL, force-stop,
actual activity dismissal and reboot have separate evidence; reboot checks a
changed boot ID. A separate case keeps the real KDF worker and holds its reply
before terminating the app, so the derivation call has not completed. It verifies surviving counts, the next escalation, staging-write
refusals and a durable successful reset despite a stale local mirror. The fixture
uses a small KDF to isolate accounting, so this does not measure guessing speed
or establish behavior on untested Android/WebView versions.

After `npm run build && npx cap sync android`, build the fixture with
`ANDROID_TIER_PROBE=pin-count npx vite build --config tests/android-tier/android-tier.vite.config.ts`
and build isolated app/test APKs. Run with `--resources <owned emulator JSON>
--output <evidence directory>`. The resource record must name `pid`, `serial`,
`avd`, `package` and `cdpPort`; the runner verifies the live QEMU command and AVD
before each device command. It removes its CDP forward and stops its instrumentation
client and isolated app. Remove its packages and owned AVD after delivery.
`PinAttemptWaitTest` covers failed persistence, migration and stale completions;
`PinAttemptWaitPersistenceTest` also checks native serialization and reboot state.

`ReminderSchedulerStoreTest.alarmsComeBackAfterEveryRescheduleEventWithTheJournalNeverOpened` checks native stored-rule recovery after boot, zone changes, package replacement, clock changes and exact-alarm grants. Its unrelated-action control includes null intents. `ReminderSchedulerPermissionTest` checks each alarm against current permission and covers revocation between the check and exact admission. Shared reminder-rule fixtures retain the spring-forward 02:30-to-03:30 case. `ReminderBootCatchUpTest` checks the durable pending record, one catch-up after a long absence, second-boot and one-off controls, persistence failure, and quiet-hour deferral through foreground sync. `ReminderBootCatchUpStoreTest` exercises the real wrapped store and hidden notification title, then clears the notification before proving that a second boot does not post it again. Its quiet-hours case checks that an elapsed one-off leaves no notification and has a real alarm at the held delivery time. `ReminderPayloadStoreTest` also checks that the pending timestamp is wrapped; `RemindersQuietHoursBoundaryTest` pins the unchanged policy while its pending record advances. The legacy migration regression keeps its seven-day anchor while allowing pending records to advance. `ReminderZoneChangeTest` covers Warsaw to New York after payload reload, foreground sync, future slots, another reminder, no zone change, the 12-hour boundary, stale alarms, boot and the original slot date under quiet hours. `ReminderZoneChangeStoreTest` splits first delivery and zone-change recovery into separate instrumentation invocations with a force-stop between them. It uses synthetic dates and zones with the real encrypted store and notifications, without changing device clock or zone. Its default invocation runs both stages and cleans up. For process-restart proof, run the test with instrumentation argument `zoneStage=first`, force-stop the isolated package, then run it with `zoneStage=second`. The second stage cleans up the stored fixture and notifications.

`ocr-offline` (`tests/android-tier/ocr-offline.mjs`) runs the production Tesseract engine and lab parser on synthetic English and Polish images in a fresh Android test installation. It enables airplane mode and disables Wi-Fi before installing the app, then checks recognition, numeric/date extraction, real progress and lazy startup. The native fixture copies OCR files unchanged from the installed APK into its Capacitor local-server probe, rather than fetching or substituting an engine.

Build and sync the app, then build the probe with `ANDROID_TIER_PROBE=ocr npx vite build --config tests/android-tier/android-tier.vite.config.ts`. Build isolated app/test APKs and supply `OCR_OFFLINE_AVD`, `OCR_OFFLINE_PACKAGE`, `OCR_OFFLINE_APK`, `OCR_OFFLINE_TEST_APK`; the package must be `dev.engender.app.test.*`. Set `ulimit -c 0` before the runner and use a disposable AVD. It records emulator ownership, restores its network settings, uninstalls its two packages and stops its emulator. Delete the owned AVD after delivery. This proves the tested Android WebView and real recognition engine; it does not replace physical-device or PWA installation checks.

`backup-power-cut` (`tests/android-tier/backup-power-cut.mjs`) exercises foreground automatic delivery and actual scheduled `BackupWork` against Android's system local storage provider. It repeats retained seeds 2311–2314 and ten additional seeds per path with 40 MiB of synthetic attachments. After each QEMU power cut, the five newest retained verified backups must restore all 3300 rows and attachment bytes; at least one preceding good backup must remain. Older ownership receipts may survive a cut between pruning and the retention metadata update, and are recorded separately. `BackupDeliveryDurabilityTest` exercises both owners against full storage, truncated read-back, a pipe and a cloud cache with a regular file descriptor. A release-only capability class refuses the instrumentation fixture unconditionally.

`mounted-status` uses the Settings language control and checks concealed export
gates, native delivery refresh and Polish status text. Its deferred-text case
clears the saved password through the native API, re-enables the destination
and lets WorkManager produce the deferral. Without a saved password,
foreground capture cannot immediately consume that state. The separate
`defer`, `verify-deferred` and `catch-up` stages prove cold execution with a
saved password and authenticated recovery.

`reset-transfers`, selectable with `ANDROID_TIER_BACKUP_STAGES`, runs
`ExportResetTest` through the actual `resetApp` and WebView reload. It requests
Start over while native key derivation is pending, during a delayed attachment
read, and during a scheduled read that never settles. Each case checks the
retained native plugin, creates a new encrypted journal, and completes its first
manual backup and scheduled snapshot in the same process. Each backup has its
own 30-second completion wait after preparation. The probe records native
method durations and saves both Archives for separate restore verification.
The companion `FileDeliveryTest` case checks stale-slot takeover and an old abort arriving
after a new file starts. JVM tests cover reset epochs and ownerless picker
callbacks. Node tests cover scheduler cancellation and pending-read cleanup.
The read delays are synthetic timing controls, not physical storage timings.

`WorkManagerStartupTest.refusedInitializationReportsFailureWithoutAdvertisingASchedule`
runs in its own instrumentation invocation. It passes a synthetic initialization
refusal through the application's WorkManager configuration, checks that scheduling
rejects it, and reads the failure and absent next due time through the real
AutoExport bridge. This tests the error path without filling storage. Device
acceptance also requires an update with `/data` at zero available blocks,
followed by the storage-full notice and its retry after freeing space. Run the
base and candidate on the same disposable AVD; never fill a shared device.

`BackupManifestContractTest` inspects all installed permissions and the native
backup components through PackageManager. It requires the delayed-job and
rescheduling owners while refusing the unused network proxy and foreground
service. `check-release-artifacts.mjs` checks the exact release APK permission
set through `aapt2`; source declarations alone do not satisfy that gate.

Run `ulimit -c 0` before starting this runner. Build the `auto-export` probe with `ANDROID_TIER_PROBE=auto-export npx vite build --config tests/android-tier/android-tier.vite.config.ts` after the production build and Capacitor sync. Supply `BACKUP_POWER_CUT_AVD`, `BACKUP_POWER_CUT_PACKAGE`, `BACKUP_POWER_CUT_APK` and `BACKUP_POWER_CUT_TEST_APK` for an owned temporary API-35 AVD and an isolated `dev.engender.app.test.*` package. `--setup-only` measures the selected system folder's sync boundary; `--skip-faults` skips the separately runnable native fault test. Use `BACKUP_POWER_CUT_PATHS` and `BACKUP_POWER_CUT_SEEDS` to replay selected cases. The proof covers the tested emulator filesystem and provider, not cloud uploads or every physical storage device. Remove the test packages and AVD after delivery.

`stalled-reopen-check` (`tests/stalled-reopen-check.mjs`) also runs with `npm
run test:browser` and in its own required CI browser job. It withholds real
schema, preference and reference-read replies during unlock, then verifies
bounded worker disposal, a usable retry without reload, preserved journal
content and harmless late replies. Visibility events are synthetic; the
application, encrypted worker and OPFS are real.

`restore-commit-check` (`tests/restore-commit-check.mjs`) runs with
`npm run test:browser` and in its own CI browser job. It holds a successful
COMMIT response or injects a worker error after COMMIT, then reopens the
encrypted journal and checks rows and attachment bytes before and after the
orphan sweep. It also checks confirmed rollback and graceful lock disposal.
Faults are synthetic; SQLite, OPFS, encrypted files and session disposal are real.

`warm-schema-check` (`tests/warm-schema-check.mjs`) runs in `test:browser` and
directly after runtime generation. It releases the real encrypted OPFS connection,
advances its version through another driver, and requires refusal before private
preference/reference reads or journal/key publication on unlock and retained return.
The old-page fixture uses the released schema-88 baseline and ceiling; current-code
cases follow the current migration list. A real schema-88 pre-migration copy is
restored beneath a suspended current page, which must migrate it before reopening.
Navigation events are injected here; actual BFCache belongs to the lifecycle tier.

`browser-tier/hot-journal.html` runs in `npm run test:browser`. It terminates the
production SQLite worker with an uncommitted transaction after cache spill,
checks that a hot journal and changed database remain, then reopens and verifies
the original rows, byte count and integrity. A separate worker calls the actual
VFS reserved-lock method at each lock level. Another production worker must fail
to acquire the live writer's pool. Worker termination proves recovery from that
interruption; it does not model a storage power cut.

`browser-tier/housekeeping.html` runs seven shared Replace/boot checks on
real encrypted SQLite and OPFS. It holds the production stock-reconciliation
write, then verifies the first eligible housekeeping run purges expired
Trash, removes every proven orphan and keeps committed photo bytes. The same
fixture runs in the Node and Android driver contract suites; native checks
use the Photos plugin's test directory. Idle waits keep the existing
mid-pass write guards. OPFS file deletion is checked separately from storage
allocation estimates, which can remain after readable files are removed.

`android-r8-artifact` checks the release R8 mapping against the native plugin
registry and source annotations. Run after an Android release build with
`node tests/android-r8-artifact.mjs [mapping.txt]`. It rejects removed or renamed
bridge methods, callbacks and runtime annotation interfaces. It also rejects
renamed annotation members reported in the mapping; R8 omits unchanged abstract
members. These interfaces must stay instantiable in R8 full mode: annotation
attributes alone did not preserve permission lookup through the bridge.
The guard requires an R8 compiler/version stamp and obfuscated app helpers.
It does not prove runtime behavior, Play's
optimization percentages, or a byte-identical rebuild from a signed tag.

The release rules also preserve the native APIs called by the separate
instrumentation APK. `android/app/native-test-api.pro` lists those members;
`native-test-runtime-api.pro` lists the shared AndroidX runtime dependencies.
Their names may change because AGP applies the app mapping to the test APK,
but their descriptors and external subclass overrides must survive. These
rules ship in every release channel. Add only a demonstrated binary dependency
when a native test or AndroidX upgrade changes this contract.

## Walkthrough groups

`search-return-privacy` (`tests/search-return-privacy.mjs`) runs after
`VITE_DEMO=1 npm run build`. Run it with Node for Chromium and with
`BROWSER_ENGINE=firefox` for Firefox. It creates a synthetic note, opens an
entry from search, verifies the restored query and refuses writes of that
query to either Web Storage owner. After closing the browser it scans its
owned profile for the query, decoding Firefox session files first. The
profile is removed even when the check fails. `search-return-flow` shares
the entry/search actions with device checks and also supports
an initialized isolated Android test journal; pulling and scanning that
package after background and force-stop remains a device check.

`page-load-browser` (`tests/page-load-browser.mjs`) checks the production app's
empty counting request, document reload, internal navigation and offline behavior.
Run after a production build: `node tests/page-load-browser.mjs`.

`page-count-hosting` (`tests/page-count-hosting.mjs`) checks the analytics privacy
boundary with real nginx and a capture server. Requires Podman:
`node tests/page-count-hosting.mjs`. It checks both fixed labels, stripped headers
and bodies, rejected input, and blocked direct collection on the dashboard.

`walkthrough-groups` (`tests/walkthrough-groups.mjs`) assigns contiguous flow ranges to four hosted jobs.
Run one with `node tests/walkthrough.test.mjs --group journal` after
`VITE_DEMO=1 ENGENDER_VERSION=9.9.9-walkthrough npm run build`. The other group
names are `setup`, `features` and `actions`; `--list` prints their inventory.
No group argument keeps the continuous walkthrough available. `--only` is a
partial diagnostic run in either mode and does not prove the whole group.

Each process owns a new browser context and origin, including OPFS, IndexedDB
and localStorage. Initialization explicitly resets the synthetic journal and
waits for the demo control's database writes to finish. Each hosted job owns
its checkout and build. Concurrent local runs may read the same completed
walkthrough build; do not rebuild underneath them. Diagnostic files and JSON
results use a unique `ci-logs/walkthrough-<group>-*` directory, or the root
set by `WALKTHROUGH_OUT`. CI keeps these results for seven days, including
passing runs, and reports per-flow durations
in the job summary. The browser matrix remains part of `All required checks`;
a failed group does not cancel its siblings.

| Group | Starting state and retained sequence | Baseline flow span |
| --- | --- | --- |
| journal | Alice persona. Entry writes remain before search; stale-backup notice stays before archive and CSV exports. | 193 seconds |
| setup | Alice persona. Onboarding variants stay together; the forgotten-PIN reset restores the persona before wrapped and comparison. Journal-book reset stays before regimen and route checks. | 296 seconds |
| features | Alice persona. The demo-jump overlap check stays before fill-every-feature and its consumers. Coming-back restores the full fixture before letters, comparison, import, injection map and eras. | 205 seconds |
| actions | Alice persona plus the full fixture, needed by quick-add dose. Tally reset stays before appointments; effects reset stays before media. Recovery-key creation, mode changes and recovery at the gate stay together at the end. | 263 seconds |

The split uses timestamps from passing [Checks run 37223064935](https://github.com/engender-app/engender/actions/runs/37223064935),
job 111497183448. The unsplit job took 1064 seconds (17.73 runner minutes),
including setup and build. The spans above exclude preparation and are not a
claim about parallel speed. No assertion or fixture scale was reduced. The
two quick-add tally cases now share a named flow so selection cannot run them
outside their group. `walkthrough-groups.test.ts` checks complete ordered
coverage and the command's selection behavior.

## Guards

Pass/fail checks: each exits non-zero when what it holds stops being true.
The Care-caption and appointment-debrief guards use the shared reporter: measured collisions, false checks, page errors and caught boot or selector errors fail their process. `guard-outcomes.test.ts` injects those outcomes into the actual scripts and checks exit status and resource closure.

CI's regression jobs run both sets from `guards.json`. The runner retries each
failed guard once and prints every result. CI uses three dev shards and six
built shards, balanced by measured duration in `guard-durations.json`, including
build costs. Each hosted job owns its browser storage and build directory.
The runner preserves roster order within each shard so demo guards finish
before the production build replaces their bundle. Local npm scripts run the
whole tier. Timing sources and the cost comparison are in [GUARD-TIMINGS.md](GUARD-TIMINGS.md).
To run one on its own, use
`node tests/<name>.mjs`, with the right build on disk first.

### `npm run test:guards` (dev server, no build)

| Probe | Holds |
| --- | --- |
| `entry-source-return-check` | entry Save and Delete return to Voice recordings, Search and margin-note hits, Today tiles, chart annotations and day lists with private query context |
| `pending-unlock-lock-check` | a newer lock cancels pending authentication and its opening transition |
| `feedback-concealment-check` | lock clears private live regions, pending announcements and toast actions; disguise leaves unlocked feedback alone; fresh feedback and keyboard actions still work |
| `blind-edge-padding-check` | a padding-only change to a field still moves `--blind-edge` |
| `gate-flag-check` | an undisguised unlock draws Today's sun, still, on a field whose edge cuts no ring where the window allows it (390x844, desktop) and that arrives at its height; a disguised one draws none of the flag at the base's height, by DOM and pixels on every palette and theme; gates that are not unlocks keep their titles; the accessible name, focus order and no scroll at 360x640, 360x568 and 320x568 hold |
| `dilation-schedule-action` | the dilation schedule's edit action, keyboard editor and its empty and deleted states |
| `letters-ready-jump` | the ready-letters count and the jump above the waiting list |
| `deep-link-consumption-check` | ready-letter and lab links apply once; folding, another analyte, URL replacement and return context survive |
| `body-map-selected-context` | the figure and the cluster select one region, and each case gets an honest sentence |
| `body-map-figure-yank` | nothing on the body map's figure is painted at its destination first or in neither place |
| `chart-tick-readout` | what a chart's tick says under a mouse and a finger, across grains, languages and widths |
| `year-days-list` | the yearly grid's days as a list: the painted cells out of the accessibility tree, every day's value (or "Not logged") read off it a month at a time, three tab stops, a tap or Enter to open and step, and the fold and a month change never moving anything in one frame |
| `year-month-labels` | Year wrapped's twelve month names stay apart, uncut and on their own month's days at 390px, 200% zoom and desktop in both languages |
| `voice-task-names` | the voice task chooser's labels fit their segments in both languages |
| `segmented-chosen-clear` | Wrapped's chosen cadence stays clear of the track's chevrons in both languages at 390px and 200% zoom, and the chevrons fade in and out with the scroll |
| `android-door-motion` | outgoing Android door content fades; warm interruptions keep the intended screen, Back and reduced motion work, and gates remove journal content |
| `margin-note-dismissal-check` | changed margin notes ask before closing; keeping preserves the composer, untouched notes close silently, and failed or pending writes retain their admission |
| `record-dismissal-check` | a cancelled dismissal keeps unsaved record edits and the sheet's position |
| `letter-composition-check` | letter dismissal, Back and navigation preserve text/date; validation, rejected and delayed storage, retry, single write, reading, lock uses real routes |
| `save-and-failure-check` | a save confirms within 1.2s, a rejected save or delete says so and keeps its sheet, a double tap writes once, surgery notes ask before a switch, Today rings the mood saved today; effect types, appointment prep add/tick/flag, Add to appointment prep, dilation schedule and felt sense write once per double tap and say a failure |
| `recovery-key-departure-check` | every way off the recovery key screen asks before the key is lost; a lock hides the key from the gate and storage and the same key comes back after unlocking, until it is acknowledged |
| `recovery-key-replacement-check` | a recovery key replacement interrupted at each cut leaves the old key working until the new one is confirmed, says so after the restart, and finishes, redoes or discards from the screen; the gate promotes a waiting key and no key characters are stored |
| `missing-access-recovery-check` | retained encrypted storage with missing or unreadable access refuses setup, reaches recovery or confirmed Archive/reset, and keeps entry/photo counts and decrypted media through a new access mode and another cold boot |
| `photo-browse-compare` | browsing, selecting and wiping photos on a small library; the change-day button stays clear of every date caption at 320, 390 and 1280px |
| `photo-grid-batching` | the grid stays whole batches deep at 3000 photos |
| `in-place-scroll-check` | opening and closing a photo and picking a chip keep the library's scroll within 1px; forward visits still open at the top and back still restores |
| `photo-export` | the export format and count are stated before anything is selected |
| `chosen-appointment` | history restores the room's question and answers; fresh visits start at question one, appointment answers stay separate, and web lock/unlock clears both |
| `appointment-entry-check` | appointment field order, saved values, suggestions, surgery links, draft dismissal, calendar handoff, deletion and the next visit card's body face; English and Polish at 390px and 200% zoom |
| `content-before-dates-check` | milestone, side-effect, cycle and hair-stage field order, saved edits, photo and anchor retention, preparation handoff, cycle visibility and shared editor safety; English and Polish at 390px and 200% zoom |
| `document-reader` | document identity, the enlarged reader, owner links and export, at 195/390/1280px |
| `empty-reflection` | Safe space's empty and sparse states, and a comfort link above the fold at 320x568 |
| `hair-progress-photo-jump-check` | the hair progress jump reaches its photo and keeps its context |
| `hair-progress-photo-actions` | Hair progress opens its own photos in shared collage/timelapse export and preserves comparison and scroll after completion or cancellation |
| `hair-removal-entry-check` | session field order, failed save and retry, duplicate taps, saved-owner photo continuation, library day, editing, deletion and privacy; English and Polish at 390px and 200% zoom |
| `hair-removal-recency-handoff-check` | the recency rows open their own area prefilled, and nothing saves before Save |
| `hair-removal-interaction-check` | saved sessions and expanded regions survive Back and interrupted navigation; recovery hides journal and editor content in both themes and motion modes, with painted captures |
| `roadmap-tick-motion-check` | ticking a roadmap step animates the box's fill, the tick and the strike rather than cutting them in |
| `search-filter-scope` | search says what its filter covers, and mode, body region and a scale range narrow it alone, with text and across a trip into an entry |
| `mark-edge-fringe` | no pixel of the mark's corners is brighter than the ground, at every size |
| `getting-started-cross-check` | Home's Getting started rows cross when done, frame by frame, and are static on a cold arrival |
| `noticed-effects-picker-check` | the entry editor's effects sheet follows the regimen, searches and takes several, and no row appears or leaves in one frame |
| `breathing-frames` | Safe space's breathing tide: nothing jumps, pops in or goes backwards across a cycle, pause, resume, a mid-breath reduced-motion switch and a trip to the background, and the Polish hold word fits the vessel |
| `tryout-save-check` | tryout label guidance, retained drafts, pending writes, discard, saved outcomes, navigation retry and photo ownership against real routes |
| `tryout-milestone-felt-check` | tryout felt-sense rows name their mood, and adoption sets the app name to the stored tryout name |
| `milestone-celebration-check` | the milestone add sheet lists every template with no shuffle, a new milestone asks for no felt sense, the celebrate switch saves, and Today throws no confetti for a milestone set not to be celebrated or an anniversary in a muted era |
| `dose-amount-check` | taken and changed doses refuse non-positive or non-finite amounts; fractions, skipped zero and animated EN/PL feedback survive |
| `range-editors-check` | regimen, dose-pause and tryout end-picker limits, inverted-save guards, equal/open bounds and feedback motion in English and Polish, light and dark; `RANGE_SIGNOFF` saves crops |
| `regimen-editor-check` | independent episode and schedule edits, retained drafts, failed writes, pending saves, pause and end actions, route discard and lock concealment |
| `document-import-check` | document import field order, saved values, owner links, draft dismissal, failures and privacy in English and Polish |
| `accessible-names-check` | English and Polish accessible names retain lab analytes, values, units and dates, resource numbers and domains, and benchmark pitches and dates |
| `lab-entry-check` | lab result field order, saved values typed key by key, draft dismissal, failures and privacy in English and Polish |
| `wear-entry-check` | a wear session duration typed key by key keeps decimals and a minus, saves the hours typed and reopens as typed; empty and negative durations stay refused |
| `leave-lock-check` | leaving locks and unmounts the journal under Immediately; two-finger swipes do not lock under any timing; Restart keeps the running journal open |
| `milestone-era-handoff-check` | Milestones exposes era creation, shares the Settings editor with era bands and retains disclosure and scroll on return |
| `milestone-era-label-clear` | an era's name on the milestone rail is drawn whole and clear of every dot's ring, today's included, at 390px, 195px and 1280px, light and dark, English and Polish, text at 100% and 200%, and still opens its era |
| `plane-date-labels-clear` | Two scales at once writes each date clear of every dot, the head's ring, the trail's joins, the readout and the other dates, inside the plot and at 4.5:1 on the card, with the head at the end and scrubbed back, at 390px and 1280px, light and dark, English and Polish, text at 100% and 200%; with motion on, no date arrives or leaves at full opacity in one frame across a play sweep and a keyboard scrub |
| `toast-stack-check` | two toasts up at once never overlap: deleting two entries inside one toast's four seconds leaves both Restore actions reachable at their centre and across a 48px target, each restoring its own entry; the earlier toast never moves while the newer arrives above it, and the later one travels into the gap over several frames when the earlier leaves; the stack centres on the content column at 1280px, failures over an open sheet stack at the top undimmed, reduced motion keeps the stack, and a lock clears it |
| `update-notice-check` | the waiting-update notice sits 12px under the screen's field at the width of its content, at 390px, 1024px and 1280px, with the rail and column keeping their places and widths; it opens and closes over several frames with the line under it travelling instead of jumping; a navigation carries it as one object from under one field to under the next, and on one side of a transition it fades; it is announced once, not by every screen that draws it; a dismissal survives lock and unlock without a second announcement, a fresh page offers the release again, unlock remounts Home and preserves an unsaved editor note on its route, Update now still hands over, and reduced motion cuts it in at the same place |

### `npm run test:guards:built` (demo build, then a production build)

| Probe | Holds |
| --- | --- |
| `bfcache-journal-check` | real BFCache Back and Forward restore journal reads and writes, including a held admitted save through navigation and reload, another navigation during a held private reopen and its late reply, without bypassing lock policy or retaining obsolete workers |
| `date-picker-check` | the date picker's day targets are 48px and own their edges; arrows, PageUp/PageDown, Shift and Enter work; typed entry refuses a day the calendar lacks; the arrows and the month drum turn months; Escape closes the drum before the picker and the picker before its sheet, at 320-430px, 200% text and 200% pinch |
| `date-picker-motion` (`--themes light --gate`) (pickers ticket 01) | the date picker opens, closes, turns a month by arrow, finger and trackpad, springs back, stretches at a bound, jumps to Today and through the month drum without a yank in any sampled frame, and a swipe past the threshold turns the month while a short one and one past a bound do not; `--out <dir>` keeps the frames for a flipbook |
| `time-picker-check` (`--themes light --gate`) (pickers ticket 02) | the time picker opens on the stored time, steps by arrow, brings a tapped row to the band, rests a flick on a whole row, turns both drums to a typed time, refuses a time that is not one, commits on Use time, leaves the value on Escape and gives focus back, offers Clear only on an optional field, and a downward swipe on a drum at 00 does not move the sheet; no drum moves its whole five-row window in one frame and the surface never arrives or leaves in one; `--out <dir>` keeps the frames for a flipbook |
| `sheet-focus-check` | a sheet takes focus and gives it back, on appointment, lab and dose screens |
| `no-auto-keyboard` | no screen, the new-entry editor and search included, arrives with a text field focused, so a phone never opens with the keyboard up |
| `dose-editor-copy-check` | dose editor labels and field order in English and Polish, without duplicate prompts |
| `dose-save-check` | Dose saves close and confirm through Care, Quick add and Today, preserving navigation and single-row confirmation |
| `sheet-navigation-leftover-check` | a sheet clears within 200ms of navigating away by tab bar or link, none left in the DOM, and Escape right after doesn't act on the departed one |
| `settings-scroll-check` | Settings scroll survives detail returns and manager sheets; fresh visits start at the top and gates hide manager content |
| `sheet-handoff-scroll-check` | a sheet raised by another's close keeps the shell inert while it is up, and the editor still scrolls once both close |
| `sheet-touch-drag-check` | a finger dragging a sheet down from its handle or body moves it with the finger and a long swipe dismisses it (real CDP touch, where `touch-action` applies) |
| `yank-sweep` (`--scenes doses-sheet,surgery-sheet,regimen-add,settings-about,letters-compose,eras-add --gate`) (ticket 244) | an ordinary sheet's rise and scrim fade actually play rather than teleporting open/shut in one frame - `--gate` exits non-zero on any style yank; render findings don't gate (tickets 149/231/152's scrim-blur-fade-in false positive) |
| `tryout-form-check` | what a screen reader is handed for the tryout form's fields |
| `media-transport-check` | both players' transports work by keyboard, speak their position, go full screen and run offline |
| `care-lane-labels` | three Care lanes' captions do not collide at 390px in Polish |
| `care-cold-load-yank` | Care's cold load at 1x and 4x CPU: no rail caption steps sideways, nothing below the care read paints before the rail, what it answers with fades in, and the nav pill never paints wider than its tab |
| `wear-tile-close-yank` | stopping the Home wear-timer tile collapses its own tier's row rather than snapping the agenda up under a still-visible ghost, even when an unrelated fold promotion lands the same tick |
| `day-cold-load-yank` | The day view's cold load at 4x CPU: margin notes and dose drug names land with the day's records, never after |
| `entry-editor-return` | The entry editor's Save keeps an accessible name, its date line clears the header, save and delete return to Calendar, Search (query kept), a day, and delete says Moved to trash with Restore or says it failed; the header field spans the same box as Care's and Day's, an opened Photos, Voice or Video section lands above the foot, and an untouched scale draws no thumb or fill and saves no value |
| `calendar-month-a11y-check` | the open calendar month is a list named by its month with one item per day, every day says its date, axe finds nothing in it, Tab walks the date links in order, and every link is 48px or more without overlapping at 360, 390 and 411px phones and the 390px desktop page (320 is printed only) |
| `quick-add-focus-check` | Enter on the add button puts focus in the quick-add fan, a labelled modal dialog over an inert screen; Tab stays in it and Escape gives focus back to the button, also after a slide onto a target; arrows on Today's mood faces move focus and open nothing; a keyboard screen change and quick add's mood land focus on the new screen's h1 with the tab title unchanged; each onboarding step's question takes focus and names the name field |
| `chart-a11y-check` | every screen that places a chart card has an unbroken heading order and no axe target-size, nested-interactive or heading-order finding; the changes line's marks meet 24px and each has a 48px row, the Look back rail's reachable controls are its two 48px handles and its list holds every fact it draws at 320 and 390px |
| `tally-chip-row-yank` | Tally's presentation chip row on a cold load: chips land with (or before) the chart, never after |
| `changes-methodology-check` | the changes screen's methodology disclosure and record action |
| `entry-pending-save` | delayed encrypted attachment writes freeze every entry field, block duplicate saves and departure, retain drafts on failure, and allow correction and retry in English and Polish |
| `radio-groups-gallery` | radio groups select by keyboard and the mood faces have full targets (a guard despite its name) |
| `prep-context-check` | an empty prep list still shows the next visit and keeps every section |
| `debrief-offer-check` | the appointment debrief loop, end to end |
| `home-fold-reserve` | nothing under Home's reserves moves in one frame on a cold open, with a right, wrong or missing guess, or when a notice inside one is dismissed |
| `cold-screen-moves` | no top-level block steps in one frame after a cold open's first paint, on the sixteen screens where one did (a heading-led ReadGate's margin, a late block cut in); `--routes` sweeps any others |
| `screen-part-last-row` | a row arriving or leaving last in a screen part, on `disclose`'s first frame, moves nothing and leaves the row before it its own margin |
| `more-search-nothing-found` | typed past its last area or record match, More's search collapses the last card and the "nothing found" notice arrives clipped, with nothing painted vanishing or jumping (a box clipped whole or transparent in both frames of a step is not counted, ticket 224) |
| `documents-rows-settle` | the documents list's first group never changes height after it paints on a cold load (row link lines and the size line land with the list), at 4x CPU |
| `tile-arrival-timing` | Today's and Look back's tiles land within 250ms of a warm tab switch and 300ms of a cold shell, and a revisit paints them in its first frame with no placeholder and nothing moving, on the web tier (the Android bridge is ADR-0089's device record, not this) |
| `home-ambient-check` | Home pauses its ambient loops after 30 seconds, keeps their clocks frozen, resumes on touch without replacement or phase reset, and respects reduced motion in light and dark |
| `home-idle-raster` | During Home's first 30 seconds after input, sun breath runs on the compositor and faces wake only while moving; raster work stays within the timer-tick budget |
| `demo-worker-startup` | a fresh demo seed draws its photos, while returning startup opens the existing journal without unused photo preparation |
| `boot-error-alone` | a boot that fails on an unreadable journal shows its notice and nothing a booted app draws, and Today leaves by crossfade rather than a cut; a refused SQLite wasm and a worker served without COEP reach the same notice; the notice names the failure in words rather than the driver's, and a development build's journal (below the baseline) gets the start-over way out and no retry; a normal boot, and one at 6x CPU, still reach Today |
| `restore-previous-journal` | after a migration fails past its copy, the failure screen offers the journal from before the update and restoring it boots, on the web (a control retry of the stamped live file must fail); an interrupted restore finishes by itself on the next boot; "Try opening again" pressed the frame it appears boots like a slow retry, 5 of 5 |
| `day-addresses` | malformed day addresses keep the unavailable notice, navigation and Back; ISO dates select the right day, future entries are refused, and same-route navigation reads the second letter |
| `device-recovery-check` | recovery after real key loss, against a production build, where the first run is real |
| `settings-erase-check` | Settings' Delete everything in passphrase, PIN, biometric (virtual authenticator with PRF) and device-bound (the web's Unlocked) mode, against a production build: Buy Me a Coffee support link immediately above About; a saved photo makes the OPFS fixture independent of deferred housekeeping; cancelling preserves every root entry and photo byte; confirming lands at first run saying so once (a reload does not repeat it) with no device key left; a new journal finds nothing from before (a control search finds the entry first) |

### Written as a guard, not in CI yet

| Probe | Why not |
| --- | --- |
| `fa16-quick-add-return` | Demo-build check of empty and running-regimen quick actions, five linked return row kinds, and dose editor handoff. Run after `VITE_DEMO=1 npm run build`. |
| `session-device-credential` | Android session gate credential fallback after refusal, feedback, keyboard focus and concurrent prompts; light/dark screenshots. Uses a native bridge fixture; Android instrumentation proves platform behavior. |
| `roadmap-goal-visibility` | Demo-build hide, reload, goal source link and restore guard. `--polish --zoom` checks Polish at 195px width; `--gallery` captures hidden goals across all palettes and both themes. |
| `locale-25` | Polish weekdays, decimal values and translated joins at 390 px; a real 30 MiB PNG imports while the document ceiling stays 25 MiB (run after a build) |
| `return-floor-check` (`npm run test:return-floor`) | Red on main. At 195px, the width 200% zoom leaves of a 390px phone, the English milestone subtitle "Its day was 4 September 2026." is wider than its row, and `.kit-row-sub` cannot break the word. Promote it once that is fixed. |
| `a11y-targets-large-text` | Every control the 30 September and 5 October accessibility audits listed, plus a new entry's first step (its five faces, the finish control and the continue control; tester report 02 ticket 03, which also moved the entry scene's chips one step on), plus every control on a new entry's second step and the tag picker in the templates sheet (the scene opens the sheet from the Settings list; its old route was gone, so it waited 20 s for a sheet and timed out on every tree; the tag info buttons walked at 43px there and on step 2 until their hit area was raised), plus opened letters' rows (12 October U38/U39), reaches 48px at 320 and 390px with text at 100% and 200% (letters also at 195px), Journal, Lab results, a saved question and In the room do the same and at 195px in English and Polish too, where Journal's month and In the room's question show whole (not cut by the viewport or an ancestor that clips sideways) and no two of their listed controls overlap (12 October U51, U52, U54; red on the base with 36 failures), and every bottom-navigation name is whole in English and Polish at 100%, 130% and 200%; the calendar's date links at 320 are printed only. A target's size is its layout box joined with any `::before`/`::after` extension, and a walk with `elementFromPoint` from its centre cuts a side short only where something covers it; the walk alone is up to a pixel off and had passed a 47px control. The run stops unless planted 47px and 48px buttons read under and at the floor. It ran in about two and a half minutes over 14 screens on 15 October; after-release 18 measured six minutes and kept it out of CI shards for that reason (after-release 18, last-audit UI 25, 48). |

`browser-tier/run.mjs` also imports seven probes (`care-read`,
`care-spine-links`, `read-failures`, `source-record-links`,
`timeline-fact-selection`, `pin-progress-status`, `gates-say-what-happened`), so they run in the browser job with
`npm run test:browser`. Three of them take `--gallery` as well.
`care-read` also checks empty timeline visibility, regimen-only schedules,
nonprojectable stock, first and last record motion, and route departures.
Its gallery includes empty Care in both languages, every palette and theme,
200% zoom and disguise.

`screen-mount.html` renders Home, Calendar, Settings and related routes over
seeded encrypted journals. The browser runner checks their DOM, computed
styles, interactions and loading gates, then repeats the narrow layout checks
at 230px. The screen contract suites run here rather than in Node. Safe space
checks held reads, pool visibility, row motion and navigation departures.
Run `node tests/safe-space-row-check.mjs` for its ten checks alone; the full
browser tier runs the same suite. The late-reads suite holds Good moments'
pool read and Tryouts' felt-sense readings, then samples every frame of the
cold load: nothing paints before its read answers and nothing is whole on
its first frame. It also checks that a refused pool read says so. Run
`node tests/late-reads-check.mjs` for its six checks in light and dark and
the per-frame tracks.

`clinician-summary-access` reruns the clinician table audit against the ticket-owned axe assets and writes paired screenshots. Run it from the prepared ticket 31 evidence tree.

`clinician-summary-print-layout` checks English and Polish summary previews and PDFs, long lab tables, printed values and caveats, and range, section and drug selections. Run after a demo build with Poppler installed: `node tests/clinician-summary-print-layout.mjs`; `--out` chooses the evidence directory.
| `claim-address-check` | Dev-server check that the address a pick kept through a lock is claimed under (`location.pathname`) is unchanged across lock and unlock on the new-entry editor, with and without a query, and on `/media/documents`. Run by hand for now. |

## Galleries and tools

Screenshots, flipbooks and measurements a person reads. None of them fail a
build. Output goes to `.claude/` unless the script takes a directory.

### Component sheets, off a browser-tier fixture page (no build)

| Script | Shows |
| --- | --- |
| `gallery:kit` | the surface kit and the chart kit, every palette and both themes |
| `gallery:controls` | the control kit, every palette, plus reduced motion |
| `gallery:icons` | the navigation set and mood's faces at every size they ship |
| `gallery:mood` | mood's ramps and faces per preset (`VITE_DEMO=1 npm run build && node tests/mood-gallery.mjs --app` shoots the built app instead) |
| `gallery:tile-block` | the tile, one crop per shape per palette |
| `gallery:progress` | the progress bar and a strip of its indeterminate sweep |
| `gallery:day` | a day's records in its three shapes, every palette |
| `gallery:body-map` | the body map's figure in its four data states |

### Screen editors (dev server, no build)

| Script | Shows |
| --- | --- |
| `gallery:hair-removal` | new and saved hair-removal editors and saved-session continuation in English and Polish across palettes and themes, with 200% zoom and disguise |
| `gallery:appointments` | the appointment editor in English and Polish across all palettes and themes, including 200% zoom and disguise |

### Screens in every state they have (demo build)

| Script | Shows |
| --- | --- |
| `gallery:gates` | the five pre-unlock gates, the security module and the first run |
| `gallery:permissions` | every permission row state, including the Android-only ones a browser cannot reach |
| `gallery:dose-sheet` | the log-a-dose sheet |
| `gallery:documents` | the documents area, including a PDF page and one the renderer could not read |

### Motion (demo build)

| Script | Shows |
| --- | --- |
| `gallery:blind-motion` | the field as a blind, in depth - the yank sweep sends you here |
| `gallery:noticed-axis-motion` | the changes axis between frames, the numbers `NoticedAxis.svelte` cites |
| `gallery:return-motion` | the return moment's five movements |
| `gallery:restore` | setup's restore step and the welcome's new foot |
| `gallery:journal-month` | the Journal's open month; `--motion` records month change, metric switch and strip to grid, with a per-frame yank count per scene |
| `gallery:flipbook` | not a gallery: turns a directory of screencast frames into one JSON bundle for a review page |

### Sweeps and measurements (demo build)

The two yank sweeps and the hydration sweep belong to their own phase of
work and were kept here without being run by ticket 33. Every other entry
on this page ran green on 2026-09-23.

| Script | Measures |
| --- | --- |
| `sweep:yanks` | every navigation and state change, per frame, for teleports and vanishes (`--prove` injects three) |
| `sweep:yanks-device` | the same sweep on a phone over USB; needs `--package dev.engender.app.test.<name>` (never `dev.engender.app`, refused before any adb call) and takes `--port`, `--reduced-motion`; see the file's header for the APK steps |
| `sweep:hydration` | every screen cold-mounted in both database profiles, for the pops the gesture sweep misses |
| `gallery:cohesion` | every route read against DIRECTION.md from the computed tree (`savebar-frame.test.ts` reads it) |
| `gallery:savebar` | what the save bar covers, per screen and viewport, in minutes rather than the cohesion sweep's 25 |
| `measure:setup-contrast` | every piece of type in setup against what is actually behind it (`--palettes`, `--themes`) |
| `cost:nav-motion` | the tab highlight's frame cadence at 4x CPU throttling, the number `app.css` and `motion-system.test.ts` cite |
| `transition-summary-overlap` (`--paint`, `--matrix`) | Transition summaries stay inside Care while replacing text; painted probe compares outgoing red ink against Surgery title blue ink in the same PNG. Matrix covers shrinking/growing summaries at 230, 430 and 1024px in light/dark and reduced motion. |
| `probe:field-text` | (ticket 285) nothing on a field paints past its painted edge or teleports against it, on every frame of every change that moves a field: doors both ways from top, middle and bottom, interrupted and reversed, deep push and back, gear, Polish, reduced motion, resize, setup's steps and handover, and the door field's height on a cold load, at 390 and 1440; `--only`, `--runs`, `--report`, `--frames`, `--json`, and `--device <serial>` to drive the Pixel WebView over its own forwarded port (`--port`, default 9341, `--package`, default the separate probe build and never the real app, `--rate` to slow the animations for reading the edge on pixels (`field-text-edge-series.mjs` reads the frames); the PIN gate opening is a scene there). Interrupted desktop scenes also observe native transition lifetimes and check the second HTML pattern and blind variables on every frame and attribute mutation, including the first transition finishing underneath it. Run them with `--only interrupted`. Timing-dependent: run it several times |
| `day-strip-fill-motion` (demo build, `--out <dir>`) | Records shared week-cell fill transitions on Wear, Cycle, dilation and hair removal in both themes. Fails when a changed fill has no intermediate painted colour; saves full casts and timestamped samples. |
| `day-strip-week-motion` (demo build, `--out <dir>`) | Incoming week labels fade and outgoing labels stay anchored on Cycle, dilation, wear and hair removal in light and dark; paging, date selection, focus transfer and reduced motion retain their behavior. Saves full painted casts and frame geometry. |
| `cycle-week-motion` (demo build, `--out <dir>`) | Weekly events withdraw and reveal while history travels between heights in light and dark. Checks event editors, date range retention, interrupted paging and reduced motion; saves full painted casts and frame geometry. |
| `tab-bar-withdraw-crossfade` | the floating bar's withdrawal crossfade across three sheet scenes, per frame, for blur snaps and dropouts (ticket 232) |

## Helpers

Imported or read by the probes above, never run on their own:
`browser-harness` (Chromium launch, reporting, `settlePage`), `serve-build` (build/ as production serves it),
`build-requests` (context request observer for the build origin),
`cold-screen-sampler` (shared frame capture),
`probe-handshake`, `palettes`, `png-decode`, `pdf-fixture`, `photo-fixture`,
`prep-fixture`, `media-fixtures`, `fake-microphone`, `motion-sampling`,
`setup-flow`, `frame-band-distances`, `contrast-walk`, `yank-sweep-core`, `field-text-core`, `field-text-edge-series`, `device-evidence`, `picker-motion-yanks`.

`run-guards` runs the roster; its Node tests check retry, builds and sharding.
The roster's `diagnostics` paths identify files to retain per attempt. Only files
created or changed by that attempt are copied; gallery-only output is excluded.

`letter-composition-gallery` captures composition and discard across all palettes, both themes, English/Polish, compact widths and 200% zoom. It needs a demo build. `android-tier/letter-composition.mjs` checks native Back and drag on a disposable emulator.

`android-tier/wear-reminder-hours.mjs` covers the wear reminder hours field, which renders only on Android. It types the hours one character at a time through `adb shell input text`, checks the reminder lands 1.5 hours after the start and that the running session reopens as typed, then checks that Stop with the hours cleared and the reminder still on keeps a reminder already due. Install a demo debug APK under `dev.engender.app.test` on a disposable emulator and pass its serial; it clears that package's data first and refuses the real app id.

`tryout-save-check` checks label guidance, retained drafts, pending writes, discard, saved outcomes, navigation retry and photo ownership against real tryout routes. `gallery:tryouts` also captures saved details and discard controls across every palette, both themes, English and Polish, with compact and 200% zoom checks. Its feedback arrival/removal scenes reuse the browser harness screencast and write timestamped frames plus a manifest for `panel-motion-flipbook`.

## Other retained probes

These tools have direct commands rather than gallery npm scripts. Each remains
available for the surface or device it measures.

| Probe | Purpose |
| --- | --- |
| `palette-name-wrap` | every flag name in the palette picker wraps only between words and stays over its own flag, English and Polish, at 320, 360, 390 and 430px; dev server, run with `node tests/palette-name-wrap.mjs` |
| `quick-add-mood-withdrawal` | check scrim withdrawal before mood navigation, chosen mood and heading focus for tap, keyboard and slide in both themes and motion preferences; requires a demo build, run with `node tests/quick-add-mood-withdrawal.mjs` |
| `quick-add-close-check` | keep the bottom bar above the scrim until its outro ends; check cancellation focus and navigation in both themes and motion preferences against a demo build |
| `quick-add-close-motion` | measure navigation edge detail in full physical compositor captures from three dedicated Quick add closes per theme; record source frame numbers and milliseconds, and fail on blurred intermediate frames |
| `device-bound-writes` | verify wrapping-key reuse and failed metadata writes on real OPFS and IndexedDB; run with `node tests/device-bound-writes.mjs` |
| `android-tab-status-strip` | sample tab and system-icon backgrounds in an Android WebView; requires a demo build and attached device |
| `yank-sweep-strip-check` | read a sweep's saved casts and check the status strip (`.app-strip`, inset minus 9 CSS px) against `--bg` in every frame, naming the first frame and millisecond that leaves it; a band a sheet's scrim dims evenly is not counted. Run `node tests/yank-sweep-strip-check.mjs <sweep out dir>` over a device sweep or a desktop `yank-sweep --force-inset 58` run; exits 1 when any cast moves. Seen failing on a demo build copy with `.app::before` transparent (the strip before carpet 15) (11 of 14 door and mood casts) before passing on the real build (`mood-pick` only, where the screen and editor field cover the band on both builds) |
| `journal-book-height` | measure the journal book height against a demo build (`measure:journal-book`) |
| `journal-book-print-diff` | compare printed journal output between demo builds (`measure:journal-book-print`) |
| `journal-book-summary-gallery` | capture journal book summary crops (`gallery:journal-book-summary`) |
| `journal-book-entry-gallery` | check range and photo selection, capture entries across palettes and themes, and verify long English/Polish notes and photos in A4 PDFs; run `node tests/journal-book-entry-gallery.mjs` after a demo build; requires Poppler |
| `journal-book-summary-signoff-page` | assemble the journal book crops into a review page |
| `settings-features-check` | checks the Features to Show manager's keyboard access, focus and scroll return, saved choices, reduced motion, palette/theme layouts, Polish disguise at 230px and actual 200% browser zoom; run after a demo build |
| `lock-timing-gallery` | capture access mode, security, setup and unlock changes against a demo build |
| `screenshot-block-row-check` | the Android-only Block screenshots row in Settings > Security, mounted over a demo build with the platform answer swapped for that one navigation: named and off on a fresh journal in English and Polish, on survives a reload, and the thumb and track travel on every sampled frame in both themes. `--shots <dir>` writes row crops, `--frames <dir>` the painted frames of each flip with their milliseconds, `--before` captures a build from before the change without asserting |
| `onboarding-scales-cold` | check that scales appear on a cold first run against a demo build |
| `regimen-editor-gallery` | capture regimen editors against a demo build (`gallery:regimen`) |
| `locale-build` | built production locale selection, isolated startup requests, both offline graphs, and online/offline language switches through Settings with localized passphrase gates |

`guard-recovery-proof` runs disposable synthetic guards through the production runner
and checks recovery, revision identity and retained evidence. The separate Guard
recovery proof workflow uploads both attempts for seven days, including on success.

`voice-tab-panel-motion` (`tests/voice-tab-panel-motion.mjs`) captures the Voice tab panel in both themes and checks withdrawal before replacement, keyboard focus, rapid switches, reduced motion and microphone cancellation. Run after a demo build: `node tests/voice-tab-panel-motion.mjs [output-directory]`.

`today-editor-opening-motion` captures Arrange Today opening in both themes with timestamped painted frames, heading styles and ancestor scroll positions. It checks final continuity, keyboard reorder and focus, tile and agenda switches, reset confirmation, and entry from an empty arrangement. Run after a demo build: `node tests/today-editor-opening-motion.mjs [output-directory] [built-root]`.

`settings-cycle-motion` (`tests/settings-cycle-motion.mjs`) checks the automatic Cycle tracking explanation against a demo build. Fresh preferences in each theme expose cuts and downstream jumps; compositor casts retain frame numbers and milliseconds. It checks Enter, Space, persistence, reduced motion and layouts at 390px, 780px and 195px. Run `node tests/settings-cycle-motion.mjs [output-directory]`.

`lookback-span-content-motion` (`tests/lookback-span-content-motion.mjs`) captures a one-day span changing to a populated history band in light and dark. Timestamped compositor frames and computed layout styles check reading tiles, summary facts, the thin-span explanation, Wrapped link, naming offer and resurfacing cards for overlap. The check accounts for inset clipping and bottom-navigation occlusion. Recorded transition keyframes reject height animation on the reading grid. Run after a demo build: `node tests/lookback-span-content-motion.mjs [output-directory] [built-root]`. Add `--matrix` for Polish, reduced motion, disguise, 195px layout and all 16 palettes.

`stock-sheet-motion` (`tests/stock-sheet-motion.mjs`) checks Add stock against a demo build. Light and dark casts retain frame numbers, milliseconds, sheet and background geometry, scroll position and theme proof. It checks continuous size changes, reduced motion, keyboard focus, creation, editing (the expiry day and pharmacy note included, shown on the row and read back by the editor) and deletion confirmation. Run `node tests/stock-sheet-motion.mjs [output-directory]`; `--baseline` records the unfixed path without requiring smooth travel.

`today-settings-sun-motion` captures both navigation directions at 195px,
390px and 1280px in both themes. Painted stripe probes check sun continuity,
including when outside identity is disguised. The recorder also checks
interrupted navigation, reduced motion, lock replacement and all 16 palettes.
Run after a demo build: `node tests/today-settings-sun-motion.mjs [output-directory]`.
`--baseline` records without assertions; `--gate-only` limits capture to lock
replacement; `--signoff` limits capture to 390px, both themes and both
navigation directions with disguise off and on.

`node tests/browser-tier/ocr-offline.mjs` uses the production service worker,
then runs the real OCR engine after offline reload. It checks English/Polish
lab extraction, interrupted installation/retry and two compatible immutable
generations. Generation B changes only a library comment, so this proves
asset isolation rather than compatibility with an arbitrary future Tesseract
upgrade. The owned Android equivalent is `tests/android-tier/ocr-offline.mjs`.

For historical retained-scanner proof, build the dispatch baseline separately
and run `OCR_LEGACY_BUILD=/path/to/baseline node
tests/browser-tier/ocr-legacy-offline.mjs`. The directory must contain `build/`
and the exact pre-generation runtime recorded in `legacy-ocr-assets.json`.
The probe opens the genuine production scanner without initializing its
library, completes the old worker's asset download, reloads to obtain a
controller, then checks interrupted update and first offline English/Polish
scans after activation. The asset recipe ships the frozen runtime under
`scripts/vendor/legacy-ocr/`. Node regressions check cache retention, staged
fallback, release-copy identity and missing/changed-byte refusal.

`restore-preferences-check` (`node tests/restore-preferences-check.mjs`) uses
production Archive encryption and Replace against isolated persistent Chromium
profiles. At seed 3204 it kills the recorded browser process before preference
writes, between those writes, before COMMIT and after the real COMMIT reply.
Cold boot must recover a complete row/preference pair with readable encrypted
attachments. Healthy checks cover English, Polish and system-language restore,
the Settings Language row, export/reopen parity and Merge's destination policy.
A post-COMMIT read-refusal trap requires success without another preference SQL
read. Held authoritative reads exercise lock, newer attachment and a later
same-value language write. `--publication-only` isolates those publication
checks and durable Settings language switches.
The runner closes its own server and browsers and removes every profile.

`pdf-retained-client-check` tests the first PDF in an old controlled page with
no worker cache entry or earlier worker request. Prepare two actual releases
with `node tests/pdf-retained-client/prepare.mjs <owned-directory>`, then run
`node tests/pdf-retained-client-check.mjs --a <owned-directory>/A --b
<owned-directory>/B`. It uses the production renderer, each release's emitted
worker and the real nginx snippets through Podman. `CONTAINER_RUNTIME` and
`NGINX_IMAGE` select another container runtime or nginx image. The operator
uses only disposable local roots. The check covers deploy, controller takeover,
explicit rollback, matching new documents and offline reopening after use.
An uncached offline first open remains unavailable. `--baseline-ref <sha>`
replays that revision's operator and nginx rules against the same release pair;
the old behavior fails the positive first-render assertion. Browsers, container
and temporary server roots close in `finally`; the caller removes prepared
release roots after use.

`src/lib/data/journal/stock-identity.test.ts` checks refills and edits across
ASCII and Unicode drug-name case variants, one projection and one automatic
reminder, and Archive Merge after a local rename. Real schema-88 and schema-90
journals upgrade with the whole latest stock choice and its reminder retained.
Timestamp ties use the later local rowid; manual reminders remain untouched.
A failure after the repair rolls rows, reminders and schema back together, and
a retry completes. Existing stock, Archive and migration suites remain active.
Real schema-90 exports with Unicode and trim duplicates are encrypted,
verified, opened and restored through Merge and Replace. They keep the whole
last eligible Archive row and only its automatic reminder. Destination uuid
and drug-key controls preserve existing stock and manual reminders; repeat
Merge changes neither stock nor reminders. No wire timestamp is inferred.

`src/lib/data/archive/kdf-cost-cap.test.ts` checks the import ceilings at
65,537 KiB, seven passes and two lanes, including a profile that doubles both
memory and passes. Every refusal is `corrupt`, with zero key-derivation calls.
A complete Archive round-trip retains the released default profile. The
container suite also keeps the measured maximum and lower-cost header controls.

`tests/android-tier/kdf-budget/probe.ts` and `ArchiveKdfBudgetTest` measure
production header parsing and derivation in the installed Pixel WebView. Five
calls per profile start ten fresh workers and receive ten worker replies;
returned keys are zeroed. Every call must fit a 2,000 ms budget. Build the
probe with `ANDROID_TIER_PROBE=kdf-budget npx vite build --config
tests/android-tier/android-tier.vite.config.ts`, after building and syncing the
app. Assemble with an isolated `dev.engender.app.test.*` application ID before
running the instrumentation class; the test refuses other packages. The regular
emulator tier reports this physical-device gate as excluded. ADR-0013 records
the chosen tuple and measured phone result.

`src/lib/crypto/recoveryKey.test.ts` pins the written recovery key for fixed
random bytes and checks every I/L spelling against a key containing 1.
`keystore.test.ts` and `data/recovery-key.test.ts` reject null JSON, unknown
KDF names and byte fields that would otherwise coerce into base64. Refusals
use the matching unreadable-file error. `key-clearing.test.ts`
checks that a fresh data key is zeroed when derivation or encryption fails.
`argon2id.test.ts` uses isolated worker stand-ins to check module startup,
prewarm reuse, termination and event suppression. Load failures derive the
known key on the main thread; workers that ran and failed refuse without
retrying. These checks run in `npm test`; the stand-ins do not prove browser
worker loading or Android behavior.


`attempt-store.test.ts` checks the browser attempt key, hostile stored values,
count clamping and unavailable storage. The throttle tests keep a pending
wait on disk while it is polled and preserve elapsed time across gate
remounts. Android gate tests display the native ledger without admitting or
resetting attempts. Leave-lock tests cover ordinary versus persisted history,
disposal, optional lifecycle targets, backwards clocks under restart and
mixed native leaves when timing changes to immediately.

`node tests/browser-tier/pin-wait-clock-jump.mjs` mounts the production PIN
gate over a synthetic encrypted journal in Chromium. A reload must owe the
full pending minute. Moving the wall clock forward one hour or ten years,
back two days, or loading a stale stored deadline cannot pay the wait.
The unlocked control also checks leave-lock on short, long and backwards
clock changes. Playwright changes system time while elapsed time keeps its
own course. The runner closes its browser and server in `finally`.

`node tests/build-requests-check.mjs` checks the request observer used by
`verify-build.mjs`. A synthetic service worker fetches another local origin.
Without CSP, the context observer records the request while the page observer
misses it. With the nginx CSP header, the sink receives nothing. The build
server reads that policy directly from `deploy/nginx/journal-headers.conf`
and sends it on documents, service workers and error responses.

Dose draft and schedule unit tests preserve saved route, site, trimmed unit
and drug fields. They check distant weekday amount cycles, route aliases,
injection boundaries, passed slots, nearest-slot ties and auto-log rhythm
guards. Epoch-day tests cover year-boundary borrowing and one-day custom
ranges. Run:

```sh
npx vitest run src/lib/data/doseDraft.test.ts src/lib/data/doseSchedule.test.ts src/lib/data/epochDay.test.ts
```

`npm run build && npm run verify:capabilities` runs the production and lifecycle
matrix sequentially in Chromium, Firefox and automated WebKit. WebKit runs in
the Playwright 1.63.0 Noble container pinned by digest in
`tests/browser-tier/capability-run.mjs`; its version must match the installed
`playwright-core`. The host needs Podman (or `CONTAINER_RUNTIME`), Chromium,
Playwright Firefox, and network access for the container's media tools.
`CAPABILITY_OUTPUT` selects a new evidence directory. Reused directories are
refused. Each engine's JSON and the combined `matrix.json` retain source
revision, dirty status, release/build identity, engine version, duration,
case results and invocation failures. A dirty source tree, stale build or failed app check exits
nonzero. This is a pre-release check, outside routine CI. `npm run verify:capabilities:lifecycle` runs only
the lifecycle portion through the same container owner.

Keep TMPDIR short for this and every Chromium probe. Chromium puts its singleton
socket under TMPDIR and a Unix socket path stops at 108 bytes, so a long one
(130 characters in re-check carpet 05) kills it at launch: the matrix then
reports every Chromium row as not-run and exits 1. `tests/browser-harness.mjs`
names TMPDIR in the launch error when that happens.

The lifecycle matrix first measures fresh static BFCache controls in the same
runtime. Chromium must restore the plain page and refuse the unload-blocked
page before exercising the app's actual retained return. Other engines mark
that app row unsupported only when their current plain control cannot restore;
a future capable runtime runs the app check. These controls are automation
evidence, not proof of Safari or installed iOS PWA behavior.

`tests/browser-tier/splash-check.mjs` retains three fresh runs of the splash
cap, first tap during/after fading, concealed input and hidden-boot checks in
each engine. Every check must reject its own injected defect: retained splash,
blocked taps, input admitted under the splash, or disabled hold cap. Hidden
visibility and suspended animation frames are emulated. Missing authenticator,
camera, microphone and native cases retain their explicit not-run or
unsupported results; splash checks do not supply that coverage.

`ANDROID_TIER_LOCK_ONLY=1 ANDROID_TIER_AVDS=tracker35 npm run test:android`
keeps the locked-journal process-death probe. It visits all four retained doors,
kills the background process, then returns separately through recents, the
launcher and a real reminder notification. Each fresh process must show the
PIN pad and contain no private fixture text in the DOM. The dedicated fixture
and notification helpers run only in an isolated package. See
`tests/android-tier/README.md` for runtime requirements and limits.

`tests/android-tier/renderer-recovery.mjs` uses the same isolated PIN
fixture (`LockedJournalProcessDeathTest#seed`). It visits all four doors,
writes an encrypted editor draft, identifies the renderer by its Android
process record's package ownership and sends `kill -9`. Three kills must
leave the app process running, with the fresh-process PIN gate, no private
DOM or retained navigation, and the draft restored after unlocking.
`--expect-close` checks the original failure instead. Supply
`RENDERER_RECOVERY_SERIAL` (an owned emulator),
`RENDERER_RECOVERY_PACKAGE` (`dev.engender.app.test.*`) and
`RENDERER_RECOVERY_OUTPUT`. The runner removes only its own CDP forward;
after changing the fixture's access mode in Settings, use
`RENDERER_RECOVERY_MODE=passphrase` and `RENDERER_RECOVERY_SECRET` to repeat
the same checks with a passphrase gate. The default is PIN `1234`.
The caller owns package and emulator cleanup. This is Android emulator
evidence, not a physical-device memory-pressure measurement.
`SqlitePluginLifecycleTest` checks that bridge destruction finishes an
admitted write before releasing its SQLCipher connection and key reference,
terminates the worker, and refuses late calls.

`tests/android-tier/evidence.test.ts` and `check-progressive-release.test.ts`
use synthetic records to check dirty-source refusal, record-only commit
equivalence, stale timestamps, missing build/stage identity and optional-stage
claims. They do not substitute for an Android runtime run. The runner records
actual completed checks and APK hashes only after a clean passing run. Current
Android must also complete isolated first-use OCR in airplane mode with its own
APK identity. `offline-ocr-stage.test.ts` uses fake device replies to verify
fresh installs, failure cleanup and restoration of network settings.
`installed-upgrade-evidence.test.ts` checks four-APK provenance for a CDP-only
upgrade, refuses mismatched sources and fabricated control roles, and keeps
optional-only evidence insufficient for the core release gate.

## First-load budget

`tests/check-first-load-budget.test.ts` reads the committed budget and rejects
a 12-file startup graph or a 14,139-byte increase, the eager d3 regression
from the audit. It also checks that the recorded byte allowance ends at
1,024 bytes above the baseline. `npm run check:first-load-budget` measures
the production build's English and Polish graphs, including the locale
selector, and gates the larger result. Record an intended graph change with
`node scripts/check-first-load-budget.mjs --record` and name it in the budget
file's dated note. Demo builds remain exempt.

## Node calendar zones

CI runs the full Node suite under both `TZ=UTC` and `TZ=Europe/Warsaw`.
The check collector reports each run's duration in the job summary and log;
a failed UTC run does not skip Warsaw. A failed build blocks both runs.

`src/lib/data/epochDay.dst.test.ts` retains the testing audit's six Warsaw
controls for the 2026 autumn and 2027 spring clock changes: day lengths,
wall-clock times, repeated and missing hours, reminder recurrence, midnight
waits and calendar-day boundaries. The test file selects Warsaw and restores
the original zone afterward, so these controls also run on hosts without DST.
`epochDay.test.ts` likewise always exercises Warsaw and Los Angeles spring
forward. Fixture timestamps in draft, cycle and legacy reminder tests use
local calendar times rather than elapsed hours from UTC or local midnight.

For a local portability check, run `npm test -- --maxWorkers=2` with each
of `UTC`, `Europe/Warsaw`, `America/Los_Angeles`, `Australia/Lord_Howe`,
`Asia/Kolkata`, `Pacific/Chatham` and `Pacific/Kiritimati` in `TZ`. Local
durations are not measurements of the hosted CI runner.

## Retained hidden-read research

`tests/retained-door-cost/README.md` describes the isolated physical Android
comparison and its web observer control. The recorded result is in
`tests/retained-door-cost/RESULTS.md`: write completion, visible read readiness
and dirty warm revisit settlement have separate boundaries. Production bounded
admission delays hidden reads by at most 75 ms before dispatch and
releases queued reads immediately when their door becomes visible.
Each sample also switches to Look back immediately after a write, before
hidden reads settle. The `current` baseline bypasses admission only in the
probe build; `bounded` exercises the production owner.
Actual-shell captures retain the existing paint hold, last-result DOM, opacity
floor, reduced-motion and lock-concealment assertions.

## Release signing certificates

`tests/check-release-artifacts.test.ts` generates disposable signing keys and
signed APK/AAB fixtures. It runs `apksigner`, `jarsigner` and `keytool` through
the release verifier, checks the expected certificate for each role, and rejects
valid signatures from other certificates or an extra AAB signer. Existing
unsigned, partially signed and tampered AAB checks remain active. Production
pins come from the public record in [SECURITY.md](../SECURITY.md#android-signing-certificates).

This Node test needs a JDK (`jar`, `keytool`, `jarsigner` on PATH) and an Android
SDK (`ANDROID_HOME` or `ANDROID_SDK_ROOT`) with build-tools and a platform
`android.jar`. It creates the fixture manifest with `aapt2`; no Gradle build or
device is used. Temporary keys and artifacts are removed after the tests.


### App names after unlock and on gates

`node tests/disguise-wordmark-check.mjs` checks the unchanged Settings footer,
About and archive error labels in EN/PL, light/dark and both disguise states.
Run again with `--gates` for both recovery bodies and the below-baseline
boot notice. `WORDMARK_SHOTS` saves crops after fonts and animations settle;
`--before` captures the baseline without asserting the repaired wording.

`tests/disguise-wordmark-native/wordmark.vite.config.ts` bundles the real
AndroidKeyGate and SessionUnlock for a test APK at `/ui03/index.html`.
Build the app and run `cap sync android` first, then build this fixture.
The fixture injects unavailable authentication outcomes, without changing
phone enrollment or testing the native authentication mechanism. Its
`wordmarkProbe.show(scene, locale, disguise, theme)` selects `cold` or
`session`; the session case presses the real unlock button. Run only in an
isolated test package under the shared phone lease. Forward only that WebView's
devtools socket, then run `WORDMARK_CDP=http://127.0.0.1:<port> node
tests/disguise-wordmark-native-check.mjs`. It asserts 16 rendered outcomes and
prints the WebView version and full sentences.

`journal-history-check.mjs` checks Journal month and recent-day restoration,
reachable scroll, fresh forward resets and separate history visits. The web
case runs in `test:browser`. Run it
with `node tests/journal-history-check.mjs` for the non-retained web route.
For an owned emulator running a fresh isolated production APK, set
`JOURNAL_HISTORY_ANDROID=emulator-NNNN` and `JOURNAL_HISTORY_CDP` to its owned
WebView CDP endpoint. This mode completes setup and saves 16 dated entries
through the editor, requires retained Journal and sends real
Android Back key events. `journalVisit.test.ts` checks visit isolation and
lock cleanup through the shared content-forgetting boundary.

`entry-source-return-check.mjs` drives the real router and editor through
Save and Delete from Voice recordings, ordinary and margin-note Search
results and an ordinary day list. It checks the selected Voice tab, Search
query and starred filter on return. It also checks that Search spends its
in-memory snapshot and that typed queries stay out of return URLs, history
state and Web Storage. The existing `entry-editor-return` guard also checks
that reloading the editor drops the in-memory Search query while keeping its
return route. Run with `node tests/entry-source-return-check.mjs`.

### Safari storage notice

`node tests/safari-storage-notice-check.mjs` checks the built production app.
Set `BROWSER_ENGINE=webkit` for WebKit and `NOTICE_RESULTS` for a JSON receipt.
`NOTICE_SHOTS` saves notice-only trans light/dark crops; `--before` captures
the generic notice on the dispatch base. Cases cover iOS/macOS Safari with
persistence granted or denied, both standalone signals, other browsers,
Polish, reduced motion, the backup link and dismissal. This is Linux engine
emulation with Safari user agents, not Safari eviction proof or Apple hardware
verification. Apple menu sources: [iPhone](https://support.apple.com/guide/iphone/iph42ab2f3a7/ios)
and [macOS](https://support.apple.com/104996).

### Android Back at lock and key gates

`node tests/android-tier/lock-gate-back.mjs <serial> <isolated-package> pin|key <output.json>`
uses hardware Back events against the production app. Seed the PIN variant
with `LockedJournalProcessDeathTest#seed`; it checks a cold PIN gate and
normal history, then locks a deep route, backgrounds it with Back, returns
and unlocks on the same route. For `key`, complete production first-run setup with device-bound access,
then cold-launch. The key-gate instrumentation fixture is emulator-only. The probe
cancels an initial native authentication prompt before checking app Back.
Physical devices require the shared phone lease before any adb command.
The package must be isolated; this probe does not seed or clear data.

### First-run setup Back

After a production build, run `node tests/setup-back-check.mjs <evidence-dir>`.
It types disposable answers, checks history Back against the setup arrow,
walks restore cancellation and both access-mode screens, then finishes and
checks Back from Today. `SETUP_ENTRY=/onboarding` checks direct entry;
`SETUP_THEME=dark` captures the dark theme. Frame measurements and actual
screencast PNGs are retained beside the result receipt.

For native Back, add `<serial> dev.engender.app.test.ui10` after the evidence
directory. Install a fresh isolated production debug APK first. The probe
uses real `KEYCODE_BACK`, records native activity state on Welcome and
checks Today after reopening. Take the shared phone lease before using a
physical serial. A sleeping or locked physical display can pause WebView
animations; that is a harness failure, not evidence about Back.

`tests/ci-checks.test.ts` exercises the local F-Droid report with failed and
different unsigned Gradle outputs. `scripts/fdroid-rebuild-report.mjs` reuses
prepared web assets, so even identical unsigned APKs do not establish F-Droid
reproducibility or installed-update compatibility. Those require the separate
[channel verification evidence](../deploy/README.md#android-channel-verification).

`manual-export` is an opt-in physical-device probe, outside default Android
instrumentation discovery. Build the ordinary web bundle and sync Capacitor,
then compile isolated APKs with:

```sh
npm run build
npx cap sync android
android/gradlew -p android -I "$PWD/tests/manual-export/isolate.gradle" --no-daemon --max-workers=2 :app:assembleDebug :app:assembleDebugAndroidTest
ANDROID_SERIAL=<owned-phone-serial> python3 tests/manual-export/run.py
```

The runner takes the shared phone lease and uses only
`dev.engender.app.test.picker77`, its test package and forward9377. It requires
an unlocked phone with English Developer options and DocumentsUI already
pointing at local Download/Downloads. It changes the actual Don't keep
activities switch, records the caller's DESTROYED state, saves through the real
picker and verifies exact bytes and SHA-256. The payload is an Archive packed
with the released KDF profile; the pulled file must decrypt and restore its
entry, preferences and photo bytes. Both APK package IDs are checked before
installation. An instrumentation case separately
counts one restored Capacitor result. Provider cases assert saved, cancelled,
truncated and refused-write outcomes, exact owned-target deletion, unrelated
file preservation, and a denied cleanup record surviving until access returns.
The host kills the app after the provider records its first partial write;
restart must remove that target without removing the unrelated file. The
runner restores the switch and setting, removes its UUID document, packages
and forward, and releases the lease. It records both APK hashes. No emulator
or provider-cloud durability claim follows from these checks.

`restored-file-delivery.test.ts` keeps restored results behind journal gates,
rejects old process/reset identities and held status replies crossing journal
replacement, and deduplicates each transfer. Native `FileResetOwnershipTest`
checks that retained staging contains no Activity or plugin owner and that
reset closes its in-memory key. Existing reset and scheduled-backup tests
remain unchanged.

`tests/protection-change-check.mjs` exercises mounted current-protection prompts
against synthetic journals, real browser storage and the shipped cryptography.
It covers PIN, passphrase and a fake WebAuthn PRF authenticator, refused and
cancelled approval, pending-key minting and single-operation approval. Both
recovery keys open the journal until written-key confirmation promotes the
replacement; only then is the old key rejected. Post-recovery setup consumes its proof once; a failed
publication keeps the old PIN and requires the existing recovery key for retry.
The fixture does not verify biometric hardware. Node tests cover Android biometric
outcomes and existing-recovery-key approval through fake ports, plus credential,
lock, cancellation, reset and session ownership races. The credential-change
probe holds OPFS publication before close and requires a lock/reset-invalidated
operation to abort, then verifies a new authenticated operation and cold unlock.
The cleanup probe requires the published secret on retry after old-binding
cleanup fails. Browser swap close and native bridge dispatch are the respective
publication admission boundaries; later cancellation cannot undo committed data.

## Photo normalization and return-surface costs

`tests/browser-tier/photos-probe.ts` checks real worker normalization, input-byte
ownership, sizing, metadata removal and typed refusals.
`tests/browser-tier/verify-build.mjs` also runs the precached worker offline.
The native long-journal `photo-add` budget remains 3,135 ms.
`tests/long-journal/return-budget.test.ts`
checks both fixture sizes against native crossing budgets and catches repeated
schedule reads. Timings and the count-baseline change are recorded in
[`long-journal/photo-and-return.md`](long-journal/photo-and-return.md).

`tests/long-journal/care-budget.test.ts` checks Care at both fixture sizes,
including parity with exposure totals. The native `BudgetBreachesTest` keeps
one-year, decade and scaling failures in the same report. Their count evidence
is in [`long-journal/care-and-look-back.md`](long-journal/care-and-look-back.md).

`src/lib/data/sqlite/trash-index.test.ts` migrates 3,653 days from released
schema 88 through schema 92. It compares journal results before and after
the index migration, checks that entries and unrelated saved rows survive,
and checks the plans emitted by the real journal methods. Recent days,
month counts, the latest written day and ranged mood averages use the day
index; trash listing and expired-trash selection use the partial trash
index. The test also purges expired entries and preserves fresh trash.
These are Node SQLite checks, not Android bridge or frame measurements.
