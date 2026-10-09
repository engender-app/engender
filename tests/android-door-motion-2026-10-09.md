# Android door departures, ticket 122

Android door changes fade the live outgoing content before releasing the
route. The field background stays in place for the incoming bridge. The
sun rings close outermost first. Content uses the 150ms token; the five
rings in the tested trans palette finish after 270ms, including stagger.
New taps can interrupt this departure.

No screen copy is retained. A superseding navigation pauses the outgoing
effects at their current opacity and cancels them when it completes or
rejects. Pending routes release in order immediately before the successor
swaps. This ordering matters because SvelteKit can mount a superseded
route after its `onNavigate` promise resolves.

## Before and after

Source baseline: ux-carpet integration `5335b31b`. A fresh physical-device
capture before editing reproduced the reported cut: the greeting, agenda
and controls disappeared at 195ms with opacity 1. Consecutive compositor
frames 13 and 14, at 168ms and 216ms, show Home replaced by Calendar's
skeleton. The 48ms gap limits the painted timing claim; the separate DOM
trace records the full-opacity departure.

Evidence remains in the integration worktree under `.claude/evidence122/`.
Reports retain detector findings, DOM timestamps, all compositor PNGs and
frame manifests. Labeled contact sheets sit alongside them. Keep this
folder while the ticket is referenced.

| Evidence directory | Runs | Painted frames | Coverage |
| --- | ---: | ---: | --- |
| `before` | 1 | 53 | Physical Today to Journal, light |
| `after-focused` | 1 | See manifest | First exit fade, same physical gesture |
| `after-device` | 84 | 5,319 | Initial twelve-direction matrix plus deep navigation, light/dark, three repeats |
| `final-device` | 72 | 4,779 | Ring closure and opacity handoff, every direction, light/dark, three repeats |
| `native-interrupt` | 4 | 251 | Final warm door/deep interruptions, both themes |
| `web` | 12 | 578 | Four web door directions and deep/Back, both themes |

All requested matrix runs completed without missing runs or action/capture
errors. `departure-summary.json` follows one visible outgoing mark per
source door across all 72 runs. None rebounded; the largest final sampled
opacity before removal was 0.004. Its 5,639 DOM samples share wall-clock
timestamps with the painted-frame manifests. Contact sheets show the
content fading while the field background stays solid. These are sampled
compositor frames, not a claim about every display refresh between them.

The matrix preceded the final correction to superseded-route release
ordering. Ordinary departures, their durations and their field arrival did
not change in that correction. The final APK's warm-interruption captures
exercise the corrected path directly, including the mounted screen title.
`interruption-before.json` retains the warm-route reproduction: Calendar
could appear during a later departure to Look back or Settings.

Native evidence comes from the Pixel 10a, Android 17, Vanadium WebView
154.0.8037.126.0. The final installed demo APK is build `1791562892532`,
version `0.0.0-dev+g6db7978d`, schema 88. APK SHA256:
`0306500c546b8725c800d2e3a37fb065074801cd8cb147f8b9d0af1f9ec28982`.
Capacitor sync preceded Gradle assembly and installation.

The final ordinary matrix still reports 284 style and 35 pixel candidates.
They include incoming read/layout changes and live text replacement. The
four vanish candidates concern Look back's changing milestone labels and
wear-status text, not a door's outgoing content being removed at full
opacity. The before capture also reports incoming skeleton movement. No
detector threshold or exclusion changed, and this ticket does not clear
those separate findings. Web reports zero style and one pixel candidate.

## Lifecycle, design and checks

The final Pixel captures contain 90 DOM samples per interruption. Both
themes pass warm Today-to-Journal interrupted by Look back or Settings:
no intermediate Calendar frame, no opacity rebound, correct final heading
and no remaining field bridge. Back returns one mounted Calendar. Reduced
motion bypasses the Android bridge in both themes. `native-interrupt.json`
records these outcomes; `device-final.png` is an ADB screen capture.

The retained `tests/android-door-motion.mjs` guard warms the destinations
before interrupting them and checks mounted headings as well as URLs.
It covers opacity continuity, route ordering, Back and reduced motion.
Its gate fixture uses the real layout in a browser with an Android
platform shim: replacing the route with the passphrase gate removes Home
and its journal content. Native gate entry was not separately configured.
The guard is indexed in `PROBES.md`, the roster and its measured timing
file. Its local run took 24.61 seconds, excluding the build.

The impeccable motion and polish pass reviewed the painted departures,
field continuity and interruption behavior. No resting layout, theme,
touch target or catalogue copy changed. The source detector reports no
findings. Existing web/deep view transitions remain in use.

Production build and typecheck pass with zero warnings. The full Node
suite passes 7,329 tests in 567 files. The browser tier and retained
lifecycle guard pass. Copy, licence, screen-class and production
first-load-budget checks pass. Logs are in the evidence folder.

Independent Standards and Spec reviews of `5335b31b..6db7978d` pass. The
main-relative diff was available as context; unrelated integrated tickets
were outside this review. Reviews caught and resolved the interrupted
opacity reset, sun exit order and superseded-route paint. Spec sign-off
includes the final physical interruption evidence.
