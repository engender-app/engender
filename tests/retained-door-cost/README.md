# Retained-door research probe

This probe compares current live-query behavior with a disposable activity
gate injected at build time. It does not change production query code.
The experiment cancels effect generations when their door becomes inactive;
its results alone do not establish a safe production scheduling policy.

The native probe uses the existing ten-year generator, encrypted media and
the actual pipelined Android SQLite driver. It retains the shipped Today,
Calendar, Look back and More components. Words reads are observed before
journal attachment because `observeWrites` binds read methods at attachment.

Run the short observer control before spending time on a native fixture:

```sh
node tests/retained-door-cost/control.mjs
```

The control uses 90 days and the encrypted web driver. It proves that the
observer and correctness assertions work; its timings are not Android proof.

Build the native probe after the required application build and Capacitor sync:

```sh
npm run build
npx cap sync android
npx vite build --config tests/retained-door-cost/retained-door-cost.vite.config.ts
```

Keep a separately built demo shell APK for `shell-motion.mjs`. The timing APK
needs a blank copied `android/app/src/main/assets/public/index.html` before
assembly, so the normal shell does not open another journal during setup.
This changes a generated asset, not `src/app.html`.

With JDK 21 and `ANDROID_HOME`, assemble the isolated app and test pair:

The isolation script includes `native/RetainedDoorCostTest.java` in this test
APK only. Ordinary Android-tier builds do not compile or discover the research
class.

```sh
cd android
./gradlew -I ../tests/retained-door-cost/isolate.gradle :app:assembleDebug :app:assembleDebugAndroidTest --no-daemon --max-workers=2
```

Use the shared phone lease and only the isolated package. The instrumentation
refuses every package except `dev.engender.app.test.retained64`. Wake the phone
before launch; the test sets `KEEP_SCREEN_ON` for its Activity. Run only
`dev.engender.app.longjournal.RetainedDoorCostTest` through AndroidJUnitRunner.

Observe `window.__retainedDoorFixtureProgress` during setup. Completed entries
and generated photos must advance; responsiveness alone does not establish
progress. The complete fixture pauses at `window.__retainedDoorStage ===
'awaiting-quiet'`. After reserving a quiet host and device, record foreground
and thermal state, then set `window.__retainedDoorQuietGranted = true` through
the owned WebView connection. The quiet pause is bounded at ten minutes.

Twelve rounds alternate current and deferred modes. The first six disable
read tracing and byte serialization; the last six attribute live-query reads
to visible or hidden owners. Save completion ends when the write resolves.
Save/revisit settlement also includes five quiet animation frames, so that
number is a synchronization bound rather than the exact first painted frame.
Fresh saved notes, retained reading DOM and lock cleanup are assertions.

The result includes source revision, probe/driver hashes, build timestamp,
fixture summary and user agent. Read `window.__retainedDoorResult`, or copy
`files/retained-door-cost-result.json` from the isolated package. Instrumentation
cleans its fixture even on failure. Remove the owned packages and forward,
then release the phone lease.

`shell-motion.mjs` checks the separately built actual demo shell in both modes:
last-result painting, authored arrival hold, the 0.004 opacity floor, reduced
motion and lock concealment. Set `RETAINED64_CDP` to the owned WebView endpoint.
Its demo journal differs from the native timing fixture; report that boundary.

A native shell install starts with access-mode setup. Choose a synthetic
passphrase through the real setup controls, then wait for both boot `ready`
and session `unlocked`. After a reload the boot gate uses
`#journal-passphrase`; a mid-session lock uses `#session-passphrase`. Keep
the Activity foreground and acquire the page wake lock before capture.
Module preload readiness is not proof that a retained door is mounted:
the layout starts retaining only after the next route change. A locked
shell deliberately has no retained door DOM.

The physical result and follow-up decision are in [RESULTS.md](RESULTS.md).
Synthetic native read receipts and compact shell assertions live in
`evidence/`. Shell sample times must not be used as performance benchmarks;
the twelve native comparison samples were recorded separately on a quiet
host/device. The captured hashes identify the measured build, before the
final research documentation was added.
