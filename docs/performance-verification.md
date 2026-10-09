# Performance verification

## 9 October 2026

Production application revision: `fa1028dfa4d1816b87f049a20bffbbf06399c57d`,
including before-release-v2 tickets 08, 09 and 10. Native benchmark harness:
`30138e162a644f9192d0d225eb634cefec7ff7fc`. No production optimization,
fixture reduction or budget change belongs to this verification.

Host: Fedora 44, AMD Ryzen 7 9800X3D, 16 logical CPUs, 32665137152 bytes RAM,
Node 24.14.1. Desktop browser: system Chromium 154.0.8037.57, headless through
`tests/browser-harness.mjs`. Lockfile SHA-256:
`83d88f9ea033409b657fdfe836c5f082459d1a24602914a9432f9e0b25610872`.

Commands ran sequentially through the orchestration memory gate. Production
build used default EN/PL locale builds, no `VITE_DEMO`, and version
`0.0.0-dev+gfa1028df`. First-load check reads those emitted files. Desktop
long-journal runner uses its existing Vite probe and real encrypted OPFS
SQLite/files; it does not time the production page's network startup.

```sh
npm run build
npm run check:first-load-budget
npm run benchmark:long-journal
```

First load passed: 104 files, English 247827 bytes gzip, Polish 249426 bytes
gzip, locale selector included. Existing ceilings remain 104 files and
251272 bytes. On-demand OCR/fonts: 21 files, 22866526 bytes gzip, reported
without a gate.

Desktop fixture uses seed 1, 365 and 3653 days, ending at epoch day 20676.
One year: 322 entries, 51 photos, 81.3 MiB reported attachment storage.
Ten years: 3300 entries over 2619 occupied days, 391 photos, 388.9 MiB,
136 lab results, 12 milestones, 242 body-region entries, 19 hair stagings and
1466 dose events. Decade Archive snapshot names 858 files. Generator also
includes documents, audio, video and remaining registered journal sections.
No workload was removed. Total desktop elapsed time: 37.5 seconds.

Both sizes passed every existing timing, mount statement/byte and scaling
check. Entry-count ratio: 10.25; existing growth ceiling: 20.50. Selected
decade results:

| Existing workload | Time | Existing ceiling |
| --- | ---: | ---: |
| Boot ready | 77.25 ms | 345 ms |
| Entry save | 19.46 ms | 200 ms |
| Photo normalize and attach | 49.28 ms | 225 ms |
| Common entry search | 8.39 ms | 150 ms |
| Search outside entries | 14.36 ms | 150 ms |
| Year chart series | 9.39 ms | 200 ms |
| Real Home mount | 36.20 ms | 200 ms |
| Archive snapshot | 201.72 ms | 815 ms |
| Archive packing | 973.95 ms | 4255 ms |
| Archive replace | 1372.51 ms | 6310 ms |

Home used 40 statements and 15.3 KiB across the SQLite driver seam, against
50 statements and 20.4 KiB ceilings. These are result transfers, not Archive
bridge bytes or first-load network bytes.

## Scheduled Android Archive measurement

Existing Archive packing score drains an encrypted container. It does not
measure scheduled bridge transfer, durable encrypted staging or delayed
WorkManager delivery. Native long-journal probe now measures those operations
separately after existing score windows, using the snapshot already captured
by its scored Archive workload. Content stays fixed for this synthetic source;
reported source timestamp belongs to the subsequent scheduled transfer.

Backup measurement is opt-in:
`longJournalDisposableBackup=true`. Native test checks emulator identity
before enabling it. Default benchmark reports this submeasurement as
`not-run`, performs existing journal workloads, and never configures or wipes
backup preferences, password or grants. Opt-in is for disposable installations:
its setup and cleanup reset those native stores. Existing origin preservation
still applies to the journal probe.

Runtime uses a disposable clone of `tracker35`: API 35, WebView
124.0.6367.219, 2 GiB guest RAM, four CPU cores, software graphics, windowed
under an owned Xephyr display. Install and instrumentation explicitly target
its owned serial. No personal phone is used.

Build order is production build, `npx cap sync android`, then probe/APKs:

```sh
ANDROID_TIER_PROBE=long-journal npx vite build --config tests/android-tier/android-tier.vite.config.ts
cd android
./gradlew --no-daemon --max-workers=2 :app:assembleDebug :app:assembleDebugAndroidTest
```

JDK 21.0.12-tem; Android SDK `/home/alice/Android/Sdk`. Runtime command,
after installation on the owned disposable emulator:

```sh
adb -s emulator-5592 shell am instrument -w -r \
  -e class dev.engender.app.longjournal.LongJournalBenchmarkTest \
  -e longJournalDisposableBackup true \
  dev.engender.app.test/androidx.test.runner.AndroidJUnitRunner
```

Setup establishes a future natural due time before staging. No previous-success
or due identity changes after staging. Production `BackupWork.OWNER` and
WorkManager handle delivery. Native helper independently checks staged and
delivered lengths/SHA-256, success timestamp and snapshot timestamp. Probe
consumes the existing Archive decoder, verifies journal/preferences, and
compares every authenticated attachment with source bytes one file at a time.
No whole-Archive buffer or aggregate file buffer is introduced.

Bridge recorder counts append calls, total/max decoded bytes, base64
characters and maximum concurrent appends. It temporarily wraps the real
Capacitor native promise function and restores it in `finally`. It records
no credentials or payload contents. Production append cap remains
1048604 bytes, with one awaited append at a time. Native file verification
and copying retain 8192-byte buffers.

PSS samples cover only the app process while waiting for natural due and
native delivery. They omit staging peak and separate WebView renderer
memory, can miss allocations between samples, and vary with collection.
They are observations, not a portable heap ceiling. Existing timing budgets
intentionally contain no heap gate. Bounded bridge pieces and streaming
ownership establish transfer bounds; PSS alone cannot establish them.

First native attempt at harness `435ab6f7b085a85eb34fbba88fe7a4a788087941`
failed after 32.401 seconds: scheduled finish delivered immediately because
fixture was already due. Harness incorrectly expected staging. Failed
instrumentation reports one test and one failure; retained as evidence.
Correction schedules a future natural due before staging. Further review
added disposable-only safety and execution deadlines covering natural delay
plus delivery allowance. No product performance regression was inferred.

Native retry at `30138e162a644f9192d0d225eb634cefec7ff7fc` passed:
one executed test, no failures or skips, 445.832 seconds. Both original native
fixture sizes passed existing timing, statement/byte and scaling gates. Both
scheduled Archives passed durable-stage, native-worker delivery, matching
length/SHA-256 and streamed recovery checks.

| Automatic backup diagnostic | One year | Ten years |
| --- | ---: | ---: |
| Entries in captured source | 322 | 3300 |
| Authenticated files recovered | 144 | 858 |
| Attachment bytes recovered | 84617401 | 403672057 |
| Largest individual file | 6291456 B | 6291456 B |
| Existing scored snapshot read | 225.5 ms | 354.9 ms |
| Scheduled producer and durable stage | 5687.1 ms | 22460.9 ms |
| Encrypted Archive bytes transferred/staged/delivered | 84926338 | 406168472 |
| Append bridge calls | 82 | 389 |
| Total base64 characters | 113235228 | 541558480 |
| Maximum decoded piece | 1048604 B | 1048604 B |
| Maximum base64 piece | 1398140 characters | 1398140 characters |
| Maximum concurrent appends | 1 | 1 |
| Scheduled wait and delivery | 174210 ms | 158768 ms |
| App-process PSS before waiting/delivery | 99472 KiB | 131756 KiB |
| App-process PSS after delivery | 99950 KiB | 126627 KiB |
| Maximum sampled app-process PSS | 104784 KiB | 131820 KiB |
| PSS samples | 1588 | 1430 |

New stage times are observations, without a newly invented timing budget.
Scheduled wait includes intentionally waiting for natural due, not just file
copying. Production worker logs show first delivery starting at
16:23:47.952 and succeeding at 16:23:48.432; decade delivery starts at
16:27:40.731 and succeeds at 16:27:42.962 (Europe/Warsaw). These worker-log
intervals include scheduling/completion work and are not isolated copy timers.

Verified Archive SHA-256:

- One year: `8fa5138de7029b9897b8e076d52291d2bbbfe52e44cc22830aaaa848a8e80332`.
- Ten years: `b59ea58b266aefa5b323cd2e9c281ba91fbd8e6b4aca44ac3061a1d8219f132d`.

Production APK SHA-256:
`b2afe74cecdcecad70d81fb37df297372eb2c2ee23373c2bae10e96d4f7208a3`.
Instrumentation APK SHA-256:
`3b134b528852ddb1d7d51642197cde2c0140d9515b5823a9888f3b061ad012b9`.

All owned emulator, Xephyr and logcat processes stopped in runtime cleanup.
Host memory samples belong to the orchestration run. Global minimum available
memory was 6354354176 bytes (5.92 GiB), including an earlier integration build;
it is not this benchmark's measured peak. Before retry, available memory was
about 11.7 GiB. Zram held about 7.2 GiB of original swapped data, roughly 3 GiB
physical per orchestration inspection. Sampling window 14:20:00-14:27:55 UTC contains 48 host observations; minimum
available memory 8298565632 bytes (7.73 GiB), maximum swapped original data
7713693696 bytes. Five samples fall below orchestration warning threshold
of 8 GiB. This flag is not kernel PSI. Root separately observed transient
startup PSI and no cgroup OOM. Raw observations remain retained. No unrelated
processes, swap configuration or apps were changed.

Final strict type check passed with zero errors and warnings. Full Node suite
passed 571 files and 7356 tests with `npm test -- --maxWorkers=2` in 65.63
seconds, including existing query-plan and journal/Archive contracts.
`check:copy`, `check:licences` and `check:screens-classes` passed. Production
source stayed unchanged, so no duplicate desktop benchmark or production
rebuild was required solely for test-harness/documentation commits. Integration
verification performs its own fresh build after merge.

Raw artifacts are currently owner-local `.claude/issue11/`, including
`desktop-base.log`, `first-load-base.log`, `native-results.json`, `logcat.log`,
`instrumentation.log`, exact APK/source hashes, final check logs and
`native-memory-samples.json`/`native-memory-summary.json`. Failed first attempt
lives under `attempt1/`. Planned durable orchestration archive:
`.claude/orchestrate/62aba06acbfc/archive/o-3519e441c707/.claude/issue11`.
Archive existence remains an orchestration hand-back check until cleanup;
these ignored raw files are not part of the source commit.

## Limits and follow-up

Desktop and emulator results do not measure physical-phone rendering, frame
rate or decoding speed. Native timing budgets contain historical Pixel 10a
measurements; emulator output must not replace those baselines. Any reproduced
budget failure needs a comparison under the same runtime and fixture before
attributing an application regression.

Release owner must run the existing native long-journal benchmark on a
designated test handset before making physical-device performance claims.
Use the signed candidate, preserve its hardware/runtime/fixture evidence and
keep the default backup submeasurement disabled. This hardware follow-up is
unverified here and does not close existing human release checks.
