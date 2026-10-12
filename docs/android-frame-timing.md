# Android startup and cold transitions, ticket 08

Investigation date: 2026-10-12. The cold-start handover stall is fixed: the splash mark now holds until the screen under it has painted and settled, and the crossfade runs at full frame rate. Visited doors stay mounted on Android, which makes revisits smoother. First visits still stall, so ticket 08 remains open.

The device is a Pixel 10a running Android 17 and Vanadium WebView 155.0.8059.39.0. The baseline is integration commit `9581741c0eac266718140c17b47c54e44b89c077`. Production builds run in the disposable package `dev.engender.app.ticket08`. The installed personal journal, `dev.engender.app`, has schema 89; this branch has schema 88 and must not replace it.

Production runs use the same persisted fixture: the seeded Alice persona after demo "Fill every feature", followed by a production APK. Initial seeding is excluded. Home settles at about 353 DOM nodes. Installing each candidate preserves that package's data. Earlier demo measurements used a smaller fixture and are retained separately.

## The cold-start handover fix

The largest cold-start stalls sat inside the splash crossfade. Re-reading `production-baseline-broad` against its own document clock, boot answered at 966 ms, the 191.7 ms gap began at 1008 ms in the first frames of the 280 ms fade, and the 174.8 ms gap followed it. Of the launch's 119 Vulkan pipeline creations, 6 happened while the mark was up, 48 (222 ms) inside the fade window and 65 (193 ms) as the reads landed after it.

The cause was in `src/app.html`. While `html[data-splash]` was set, the app root sat at opacity 0 under an opaque `#splash`. Blink does not paint a subtree at opacity 0, and nothing under an opaque layer is rastered, so the WebView first drew Home on the first frame of the fade and compiled its pipelines there. Home's DOM existed from about 770 ms; the GPU saw it only at 966 ms. This also explains why removing the fade (the `ablate-splash` run) did not help: the compile still landed at the reveal, as a cut instead of a fade.

The fix keeps the crossfade and changes when the screen first reaches the GPU:

- The app root waits at opacity 0.004 under a mark at 0.996, with `will-change: opacity`. Blink paints anything above 0.0004, the mark no longer counts as an occluder, and what shows of the screen through the mark is 0.004 x 0.004, far below one 8-bit level.
- `answerSplash` holds the mark, which does not move, until the screen's held reads have answered, the arrivals they start have finished, and three frames in a row take under 25 ms, capped at 2.5 s. Arrivals count because a read's body fades in from opacity 0 and so first reaches the GPU when its own fade starts; a first version that waited only for the holds handed over 38 ms before a 158 ms stall with 33 pipeline creations.

The table compares three untraced cold launches per arm from one APK (`splash-warm-2.apk`), with a stored switch selecting the arm. The middle arm waited only for the first paint and was dropped.

| Arm | Fade start, ms | Frames in the 280 ms fade | Worst gap in the fade, ms | Gaps over 50 ms after the fade began |
| --- | --- | --- | --- | --- |
| Before | 958 / 879 / 937 | 6 / 3 / 5 | 150 / 242 / 192 | 5 / 4 / 5 |
| Wait for first paint (dropped) | 1265 / 1300 / 1234 | 19 / 17 / 17 | 67 / 58 / 67 | 2 / 2 / 2 |
| Wait for the settled screen (shipped) | 1941 / 1967 / 1993 | 34 / 34 / 34 | 8.4 / 8.4 / 8.4 | 0 / 0 / 0 |

The display runs at 120 Hz during the fade, so 34 frames is every frame. In one broad-traced launch of the shipped arm, all 122 pipeline creations happen while the mark is up and none during or after the fade (`warm2-trace-b-1`). The final candidate without any switch, `final-hold.apk`, repeated this in three cold launches (`final-hold-{1,2,3}`): 34 frames, an 8.4-8.5 ms worst gap, and every gap over 50 ms ending before the fade began.

The cost is time. The fade now starts at about 1.95 s instead of 0.94 s, and Home finishes settling at about 2.25 s instead of about 1.75 s, though the earlier time came with four or five visible stalls. Boot-ready itself moves about 300 ms later because the compile still blocks the Android UI thread, and with it the native bridge (tickets 207 and 225); it now does so while the mark is up. Home's own entrances play out under the mark, so the crossfade dissolves into a finished screen. The shell payload is 251,061 of 251,272 bytes.

Screen recordings of all three arms in both themes (`rec-{dark,light}-*`, flipbooks in `splash-warm-review/`) show the same thing frame by frame: before, the fade is a cut between two frames; with the shipped hold, it runs in about 8 ms steps into a settled Home.

## Door preload and retained doors

Two other changes, both Android only, target revisits and first taps rather than the cold start.

Preload: once the splash has gone and the app is idle, the four doors' code is imported one module at a time. It stops on input, while hidden or when a navigation starts. The idle callback carries a 1,000 ms timeout because the static WebView left plain idle callbacks queued until the next navigation. Repeated runs (`followup-doors-{control,preload}-{1,2,3}`) settle the result at 31 fewer resource loads on the first tap. An early single-run timing gain (83 to 50 ms) did not repeat, so no timing gain is claimed for preload.

Retention: after the next route commit, a lazily loaded host keeps each visited door mounted. The active door is `display: contents`; the others are `display: none` and inert. Revisits reset each page's transient state (folds, prompts, search, disclosures) while committed values such as the Stats span stay. Lock and recovery remove the journal roots before the gate paints, and the retained session key changes so a one-frame unlock cannot revive the old instances.

On the diagnostic build that could switch retention off (`frozen-retention-summary.json`, same APK), the median worst warm gap fell from 83.4 / 87.5 / 58.4 / 66.7 ms to 50.1 / 58.4 / 41.8 / 50.0 ms for Journal / Look back / Transition / Home. All 60 settled geometry snapshots matched. Stats' field readiness barely changed. First visits are not faster, which is part of why ticket 08 stays open.

The production candidate with both changes and the handover fix (`final-hold.apk`, `final-hold-retained-1`, one run, every settled snapshot correct) gives first-visit worst gaps of 125 / 67 / 67 / 67 ms for Journal / Look back / Transition (`/more`) / Home, and warm ones of 50-58 / 58-67 / 42-50 / 42 ms. That is in line with the previous candidate (`final-timeout-1`).

Memory was bracketed with the expanded workload: Journal's months and recent days, Look back's facts and on-this-day, a search with 20 hits, Home's tile fold, three loops, then Home. The retained arm ran on the production candidate (`expanded-retained-final`). The two normal arms ran before and after it on the frozen diagnostic build with retention switched off (`expanded-normal-a`, `expanded-normal-b`), so the comparison crosses binaries. Against the mean of the normal arms, retention costs +5.3 MiB of natural PSS (-2.4 to +13.1 against either arm alone), +0.9 MiB after a forced GC (-7.9 to +9.7) and +0.2 MiB of JS heap. The two normal arms differ from each other by 15 to 18 MiB, so this cannot resolve the cost more finely than about 9 MiB either way. It agrees with the earlier same-build estimate of +8.8 MiB (+4.4 to +13.2) and with the 5 to 10 MiB allowed for retention.

The browser lifecycle harness (`tests/android-door-motion.mjs`) covers identity and adoption, the four warm identities, focus, field, inert and motion ownership, rapid door and deep-route interrupts, Back, reduced motion, sheet and scroll-lock cleanup, revisit resets, recovery and the first gate with zero journal roots, a one-frame lock and unlock, a real passphrase unlock, and a held SQLite insert surviving departure and reload. It passes on the final source. On the phone, `physical-lock2` set a passphrase and immediate locking through the UI, visited all four doors, left the app and came back: the gate showed no retained door and no journal screen, and a real unlock brought back only Home (`final-hold-lock2.json`). The original helper failed on this build for two reasons outside the change. A hidden retained Home heading satisfied its wait for a screen heading, and in a process that opened unlocked, setting a passphrase locks at once. The copy waits for a visible heading and unlocks when that happens.

## Still open

- First visits. They are not faster: in the final run, first-visit worst gaps are 67 to 125 ms and the incoming field is ready 311 to 496 ms after the tap. Warm Look back's 74 ms Svelte callback (below) is unchanged. Ticket 08 stays open for this.
- Android's starting window. Recordings of every arm show the launcher icon large in the starting window, fading out, about 200 ms of bare ground, then the web mark appearing in one frame at a smaller size. The handover fix does not touch it. Making the starting window and the first web frame agree has to respect disguise, because the starting window shows the launched alias's icon.
- A navigation desync, seen once. Right after an access-mode change landed on Lock & recovery, a link to `/settings/access-mode` committed its URL while Lock & recovery stayed on screen until the next navigation. Repeating that flow 18 times (`race-final-hold`, `race2-final-hold-b`) did not reproduce it. The path it took, a view transition between two routes outside the four doors, behaves as it did before retention. It is not attributed.
- Access mode after a quick kill, seen once. A change from passphrase to unlocked that the screen had confirmed was gone after a force-stop about six seconds later, and the next start asked for the passphrase. The same change followed by a 15-second wait survived a restart. It was not investigated further. The thing to check is what `changeAccessMode` has written to disk by the time it reports success.

## The original investigation

Everything below is the investigation as it stood before these changes. Its numbers describe the baseline build.

### Startup comparison

Each run force-stops the process, launches Home, and samples for 12 seconds. Times below use document `performance.now()`, not Android's total launch time. The DOM timestamp is the last observed node-count change; it does not prove that rendering has finished. The rAF gap measures callback spacing, not a count of dropped display frames.

The grouping candidate extends the existing demo chunk grouping to production. Requests fall from 219 to 40, including a reduction from 200 JavaScript files. The largest gaps remain after readiness.

| Production run | Boot ready ms | Last DOM change ms | Worst rAF gap ms | Long task ms |
| --- | ---: | ---: | ---: | ---: |
| Baseline 1 | 981.6 | 1607.3 | 158.3 | 62 |
| Baseline 2 | 981.7 | 1638.1 | 175.0 | 63 |
| Baseline 3 | 909.7 | 1559.3 | 158.3 | 63 |
| Grouping 1 | 766.2 | 1393.4 | 158.4 | 79 |
| Grouping 2 | 772.8 | 1352.3 | 158.4 | 75 |
| Grouping 3 | 755.4 | 1401.6 | 166.7 | 71 |

Grouping also increases the shell's maximum locale gzip payload from about 251,125 to 265,386 bytes, exceeding its 251,272-byte budget. A separate Home chunk experiment was larger still. Grouping was reverted because these costs did not buy a demonstrated improvement in stutter.

Native FrameTimeline captures accompany the third baseline and grouping runs. The baseline contains 18 late frames whose labels include `App Deadline Missed`; grouping contains 13. Their longest app frames are 300.56 and 306.29 ms. This single pair does not establish improvement. Most records are `Buffer Stuffing` with `On-time Present` (2028 baseline, 2054 grouping); counting these as dropped frames would be wrong.

Those native files contain no scheduler, thread-state or ftrace events, despite the requested configuration. Their original JavaScript metrics also lack `performance.timeOrigin`, preventing exact alignment between the two clocks.

### Where the time goes

A broader CDP capture identifies GPU work hidden by the earlier timeline categories. In `production-baseline-broad`, a 191.7 ms callback gap overlaps a 192.68 ms Android `DrawFn_DrawVk`. RenderThread waits 190.21 ms for a GPU sync token. During that draw, the GPU thread spends 131.04 ms in `VulkanCreateGraphicsPipelines` and 167.83 ms in raster flushes. These durations overlap and must not be added.

The next 174.8 ms gap overlaps another 165.84 ms native draw with 91.0 ms of pipeline creation. Pipeline creation totals 465.89 ms. This identifies expensive Vulkan graphics pipeline creation. It does not establish a shader-cache miss or why the driver takes that time.

Layer capture maps costly raster work to several elements: navigation, mood-mouth paths, the shared `#app-main` surface and fading reserve bodies. The navigation surface alone has a 99.03 ms flush in that capture. No single removed animation explains the result. Broad tracing records about 572,000 events and affects timing; it supports attribution, while equivalent untraced runs must establish improvement.

### Look back and warm visits

First Look back and warm Look back have different largest stalls. In `production-baseline-lookback-broad`, first Look back's roughly 50 ms gaps coincide with native GPU draws. Warm Look back has no new resources or native calls, yet its worst 91.7 ms gap contains a 91.67 ms renderer task. A Svelte callback consumes 74.09 ms, including 18.61 ms of forced style/layout and 5.32 ms of garbage collection.

A separate CPU profile attributes about 15.79 ms to AppNav geometry reads and 4.75 ms to `readingGrid.ts` animation scans. These identify work to investigate, not validated fixes. Warm Home also has a 99.38 ms renderer task without new resources, native calls or Vulkan pipeline creation. A startup GPU remedy alone cannot account for these warm stalls.

### Rejected experiments

Single-run CSS ablations produce these worst gaps: a 2D root transform, 141.8 ms; hidden sun, 141.8; hidden skeleton sweep, 150.1; removed clipping, 166.7; disabled motion, 191.7; removed splash-root fade, 191.8; retained reserve opacity layers, 141.7. They provide no repeatable remedy and several change the intended appearance. Earlier resize deferral, geometry caching, containment, offscreen cards and reply batching also failed validation. Their evidence remains available.

A native hardware layer around the WebView also failed. Its two startup gaps were 175.1 and 166.7 ms. First and warm Look back gaps were 58.3 and 83.4 ms, within the observed baseline range. The native change was reverted. None of these experiments remains in the app.

A baseline relaunch after a longer idle period still reached 191.7 ms. Upstream Chromium 155 creates the WebView draw context without installing a persistent cache in its options, while other raster contexts have separate cache paths. The trace alone cannot establish which cache missed. No supported application API was found to precompile or flush these pipelines. See [WebView context creation](https://github.com/chromium/chromium/blob/155.0.8059.39/android_webview/browser/gfx/aw_vulkan_context_provider.cc#L156) and [the traced pipeline call](https://github.com/chromium/chromium/blob/155.0.8059.39/gpu/vulkan/vulkan_util.cc#L192). These are upstream sources; Vanadium patches and the device driver were not audited.

Only this physical device is available. The remaining work is an engine/device comparison or a smaller rendering reproduction, followed by a remedy that improves the same untraced startup and Look back sequences. Warm renderer work needs separate validation. Removing motion, changing security settings, or disabling hardware acceleration has not been accepted as a remedy.

## Verification

On the final source: typecheck reports zero errors and warnings, and the Node suite passes all 7,562 tests across 582 files. In one earlier full run, the timing assertion in `src/lib/audio/live.test.ts` failed under load (0.3 ms against 2.1 ms with a 3x bound); it passed three times alone and in the final run, and this branch does not touch audio. Copy, licence, screen-class and first-load guards pass. The shell is 104 files and 251,061 bytes gzip for the larger locale, inside the unchanged 251,272-byte limit. The browser lifecycle harness, `tests/android-door-motion.mjs`, passes. The new splash tests fail against the pre-ticket `splash.ts` and `app.html` and pass on the change. On the phone, the production candidate repeated the handover result (`final-hold-{1,2,3}`); its retention timing, memory and configured-lock checks are described above.

Main's latest CI run, [38136777462](https://github.com/engender-app/engender/actions/runs/38136777462), passed at `de5eb9dc`.

The evidence-only report that preceded these changes was verified at the time with 7,527 tests across 580 files. Its first Node run failed only because a sandbox denied test subprocesses and loopback sockets. No visual sign-off is claimed for the rejected overrides.

## Evidence and reproduction

Raw artifacts remain in the primary checkout's `.scratch/phase-15/final-audit/evidence08/`, outside the disposable worktree. `full-production-before-{1,2,3}` and `full-production-after-{1,2,3}` supply the table. `startup-{before,after}.perfetto-trace` supplies native counts. `production-baseline-broad`, `production-baseline-layers`, `production-baseline-lookback-broad` and `cpu-stats-warm.json` supply attribution. `trace-analysis08-notes.md` records query methods and limitations; `ablate-*`, `hardware-layer-*`, `rejected-startup-group.patch` and `rejected-resize.patch` preserve rejected trials.

The handover fix and the retention results come from these runs. `warm-{none,a,b}-{1,2,3}` ran on `splash-warm-1.apk`, whose third arm waited only for held reads; `warm2-{none,a,b}-{1,2,3}` ran on `splash-warm-2.apk` and supply the table above. `warm-trace-{none,a,b}-1` and `warm2-trace-b-1` are the broad traces, bucketed by `splash-warm-phases.py`. `final-hold-{1,2,3}` are runs of the production candidate, `final-hold.apk`. `rec-{dark,light}-*` and `splash-warm-review/` hold the screen recordings. Retention's numbers come from `final-hold-retained-1`, `expanded-{normal-a,retained-final,normal-b}` and `final-hold-lock2.json`; the navigation repeats are `race-final-hold.json` and `race2-final-hold-b.json`. `splash-warm.mjs` sets a stored switch that the app no longer reads, so on the production candidate it measures the shipped hold whichever arm it is given. `final-hold-lock.json` and `physical-lock-failed.json` record the original lock helper's failed run on this build; the second file overwrote that helper's earlier failure record from the diagnostic build.

The current candidate reproduces with:

```sh
E=/home/alice/_projekty/priv/gender-diary/.scratch/phase-15/final-audit/evidence08
adb -s "$ANDROID_SERIAL" install -r "$E/final-hold.apk"
node "$E/splash-warm.mjs" repeat-hold none
node "$E/final-retention.mjs" repeat-retention retained
node "$E/physical-lock2.mjs" repeat-lock
```

`physical-lock2.mjs` switches the fixture to a passphrase and back through the UI. Wait 15 seconds after it before force-stopping the app, then check that a cold start opens Home without a gate (see Still open).

Export the connected serial as `ANDROID_SERIAL`; `cdp.mjs` reads it. Keep the phone unlocked and the isolated app foregrounded. Use fresh output names:

```sh
E=/home/alice/_projekty/priv/gender-diary/.scratch/phase-15/final-audit/evidence08
adb -s "$ANDROID_SERIAL" install -r "$E/production-baseline.apk"
node "$E/startup-cold.mjs" repeat-startup --no-trace
node "$E/lookback.mjs" repeat-lookback --no-trace
```

For native capture, set `E` as above in another terminal. Start capture immediately before startup, then pull the trace:

```sh
adb -s "$ANDROID_SERIAL" shell perfetto --txt -c - \
  -o /data/misc/perfetto-traces/ticket08-repeat.perfetto-trace < "$E/startup.cfg"
adb -s "$ANDROID_SERIAL" pull \
  /data/misc/perfetto-traces/ticket08-repeat.perfetto-trace "$E/repeat.perfetto-trace"
```

These commands require the isolated fixture. If the package has been uninstalled, recreate the Alice demo and run "Fill every feature" before installing the production APK. Do not substitute the personal journal package.

`startup-broad.mjs` adds GPU categories; `startup-layers.mjs` records structural node identifiers without journal text. Port 9338 belongs to this investigation. Leave port 9333 and package `dev.engender.app.sweep09` alone. The original tiles selector is incorrect; ignore that metric.
