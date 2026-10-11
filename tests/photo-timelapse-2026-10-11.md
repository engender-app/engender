# Photo timelapse verification

11 October 2026, phase-15/tester-report-01 ticket 14.

| Runtime | Result |
| --- | --- |
| Chromium 154.0.8037.57, Linux, Playwright | Preview and shared-file playback pass |
| FFmpeg and ffprobe, Linux | Shared file decodes as VP8, 1080 × 1080, duration 1.301373 seconds |
| Android | Runtime test not run. The Pixel 10a disconnected before the device lane became available |

The failure reproduced before the fix: one photo produced a 0.001-second
video; two photos produced 0.701732 seconds. Canvas capture emitted frames
only when the photo changed, so the final photo had no sustained hold.

`tests/photo-export.mjs` checks preview playback and its duration, playback
of the file passed to the share API, red-then-green photo order, repeated
generation, cancellation with 36 and 200 selected photos, and collage
export. It also injects an encoder error and corrupt output, checks that
neither exposes a share action, and generates successfully after failure.
The browser without MediaRecorder keeps collage export and explains that
video recording is unavailable. The gallery run covers all palettes and
light/dark themes, disguise, Polish, 320px width and 200% page scale.

The shared bytes were saved locally and decoded independently with
`ffmpeg -v error -i <file.webm> -f null -`. ffprobe reported the codec,
dimensions and duration above. No decoder error occurred.

The production build, svelte-check with `--fail-on-warnings`, copy,
licence, screen-class and first-load checks pass. The full Node suite
passes 580 files and 7529 tests, including nine timelapse recorder tests.

A debug APK was built after `cap sync android`, with JDK 21.0.12 and
Android compile/target API 36. An ignored Gradle init script assigned the
isolated application ID `dev.engender.app.ticket14`; aapt confirmed that
ID before any installation. The APK was not installed. No device action
changed the existing app or its journal. Android playback and native
sharing still need a connected device; no Android or WebView runtime
version is claimed as tested.
