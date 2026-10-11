# Android startup and cold transitions, ticket 08

Investigation date: 2026-10-12. No fix is validated. Ticket 08 remains open because faster readiness has not removed the reported stalls.

The device is a Pixel 10a running Android 17 and Vanadium WebView 155.0.8059.39.0. The baseline is integration commit `9581741c0eac266718140c17b47c54e44b89c077`. Production builds run in the disposable package `dev.engender.app.ticket08`. The installed personal journal, `dev.engender.app`, has schema 89; this branch has schema 88 and must not replace it.

Production runs use the same persisted fixture: the seeded Alice persona after demo "Fill every feature", followed by a production APK. Initial seeding is excluded. Home settles at about 353 DOM nodes. Installing each candidate preserves that package's data. Earlier demo measurements used a smaller fixture and are retained separately.

## Startup comparison

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

## Where the time goes

A broader CDP capture identifies GPU work hidden by the earlier timeline categories. In `production-baseline-broad`, a 191.7 ms callback gap overlaps a 192.68 ms Android `DrawFn_DrawVk`. RenderThread waits 190.21 ms for a GPU sync token. During that draw, the GPU thread spends 131.04 ms in `VulkanCreateGraphicsPipelines` and 167.83 ms in raster flushes. These durations overlap and must not be added.

The next 174.8 ms gap overlaps another 165.84 ms native draw with 91.0 ms of pipeline creation. Pipeline creation totals 465.89 ms. This identifies expensive Vulkan graphics pipeline creation. It does not establish a shader-cache miss or why the driver takes that time.

Layer capture maps costly raster work to several elements: navigation, mood-mouth paths, the shared `#app-main` surface and fading reserve bodies. The navigation surface alone has a 99.03 ms flush in that capture. No single removed animation explains the result. Broad tracing records about 572,000 events and affects timing; it supports attribution, while equivalent untraced runs must establish improvement.

## Look back and warm visits

First Look back and warm Look back have different largest stalls. In `production-baseline-lookback-broad`, first Look back's roughly 50 ms gaps coincide with native GPU draws. Warm Look back has no new resources or native calls, yet its worst 91.7 ms gap contains a 91.67 ms renderer task. A Svelte callback consumes 74.09 ms, including 18.61 ms of forced style/layout and 5.32 ms of garbage collection.

A separate CPU profile attributes about 15.79 ms to AppNav geometry reads and 4.75 ms to `readingGrid.ts` animation scans. These identify work to investigate, not validated fixes. Warm Home also has a 99.38 ms renderer task without new resources, native calls or Vulkan pipeline creation. A startup GPU remedy alone cannot account for these warm stalls.

## Rejected experiments

Single-run CSS ablations produce these worst gaps: a 2D root transform, 141.8 ms; hidden sun, 141.8; hidden skeleton sweep, 150.1; removed clipping, 166.7; disabled motion, 191.7; removed splash-root fade, 191.8; retained reserve opacity layers, 141.7. They provide no repeatable remedy and several change the intended appearance. Earlier resize deferral, geometry caching, containment, offscreen cards and reply batching also failed validation. Their evidence remains available.

A native hardware layer around the WebView also failed. Its two startup gaps were 175.1 and 166.7 ms. First and warm Look back gaps were 58.3 and 83.4 ms, within the observed baseline range. The native change was reverted. No application change remains from this investigation.

A baseline relaunch after a longer idle period still reached 191.7 ms. Upstream Chromium 155 creates the WebView draw context without installing a persistent cache in its options, while other raster contexts have separate cache paths. The trace alone cannot establish which cache missed. No supported application API was found to precompile or flush these pipelines. See [WebView context creation](https://github.com/chromium/chromium/blob/155.0.8059.39/android_webview/browser/gfx/aw_vulkan_context_provider.cc#L156) and [the traced pipeline call](https://github.com/chromium/chromium/blob/155.0.8059.39/gpu/vulkan/vulkan_util.cc#L192). These are upstream sources; Vanadium patches and the device driver were not audited.

Only this physical device is available. The remaining work is an engine/device comparison or a smaller rendering reproduction, followed by a remedy that improves the same untraced startup and Look back sequences. Warm renderer work needs separate validation. Removing motion, changing security settings, or disabling hardware acceleration has not been accepted as a remedy.

## Verification

The production build and native hardware-layer trial build completed. After reverting the trial, only this report differs from the integration baseline. Typecheck reports zero errors and warnings; the Node suite passes all 7,527 tests across 580 files. Copy, licence, screen-class and first-load guards pass. The final shell measurement is 104 files and 251,113 bytes gzip for the larger locale, within the unchanged 251,272-byte limit.

The first Node run failed because the sandbox denied test subprocesses and loopback sockets. The same suite passed outside that sandbox. Main's latest CI run, [38136777462](https://github.com/engender-app/engender/actions/runs/38136777462), also passed at `de5eb9dc`; no application failure is being attributed to main here. No visual sign-off is claimed for the rejected overrides.

## Evidence and reproduction

Raw artifacts remain in the primary checkout's `.scratch/phase-15/final-audit/evidence08/`, outside the disposable worktree. `full-production-before-{1,2,3}` and `full-production-after-{1,2,3}` supply the table. `startup-{before,after}.perfetto-trace` supplies native counts. `production-baseline-broad`, `production-baseline-layers`, `production-baseline-lookback-broad` and `cpu-stats-warm.json` supply attribution. `trace-analysis08-notes.md` records query methods and limitations; `ablate-*`, `hardware-layer-*`, `rejected-startup-group.patch` and `rejected-resize.patch` preserve rejected trials.

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
