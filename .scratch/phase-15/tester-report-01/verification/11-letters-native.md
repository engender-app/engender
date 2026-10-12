# Letters navigation verification, 12 October 2026

The reported two jumps remain unreproduced. The 11 October 18:27 source is
audio only, so the original positions and timing cannot be compared with
these captures. The original reproduction acceptance item is not satisfied.
Current web and physical Android navigation support closing this ticket
without a product patch, subject to evidence review.

Paths beginning `.claude/` below refer to the archived ticket worktree at
`.claude/phase-15-tester-report-01-delivery/archive/tester-parallel-11/` in
the primary checkout. Native capture directories are under its
`.claude/ticket-11-motion/` directory.

Web evidence remains in `.claude/ticket-11-motion/REPORT.md`: 46 captures and
1344 painted frames on `4796a6030195a37fdadb557f0e63570d7c46fde8`. The native
APK contains `c7a16eb799d691477a483da7ed7dae383b8ec403`, release build ID
`1791762423760`, SHA-256
`7f08472378ac1a97979b3ddbbbc4a360717ba12939271fe0ffd37e481b25c71b`.
Only the shadow Android project's application ID differs from the source:
`dev.engender.app.tester11`. The original installed app was not modified.
Device: Pixel 10a, Android 17/API 37, WebView Chrome 155, 411x923 CSS pixels.

The accepted native matrix contains 38 captures and 1119 painted frames:

- The first 32 scenes in `native-resumed-ready/report.json` contain 940
  frames. Empty and populated Letters, normal and reduced motion, two
  repetitions, source scroll 320px and a centered Letters row are covered.
  Every entry starts one transition and finishes at Letters 0px. System Back
  restores exactly 320px or the measured row position, 536.3809814453125px.
  The populated fixture contains three synthetic letters, two sealed.
- `native-extras-complete/report.json` contains six scenes and 179 frames.
  Each rapid double tap dispatches two trusted clicks and starts one
  transition. Native Back interrupts an active transition and restores the
  source position. Home and app return exercise the real native lifecycle
  with PIN locking, once for each motion preference.

During each ordinary transition and each double tap, sampled old-screen
opacity never increases and new-screen opacity never decreases between
`ready` and `finished`. The retained consecutive PNGs show one handover,
without alternating viewport ownership. The pixel detector still reports
13 dropout alerts across eight ordinary Back captures and five across three
extra captures. These are not discarded or described as a clean detector
run. Inspection attributes them to moving separators and fading content;
the original pair of navigation jumps is not reproduced.

## Gate visibility boundary

All times below are milliseconds from that capture's first compositor frame.
The runner's `background` flag marks Home dispatch intent, not proof of when
Android stops displaying the app. All frames and samples are retained,
including the interval before `visibilitychange` reports `hidden`.

| Letters motion | Home marker | First gate DOM | Hidden | Visible again | First returned PNG |
| --- | ---: | ---: | ---: | ---: | --- |
| Normal | 267.4 | 517.9 | 921.8 | 1508.5 | `028-1551ms.png`, 1550.8ms |
| Reduced | 355.0 | 561.2 | 883.2 | 1635.4 | `012-1662ms.png`, 1662.2ms |

Normal motion retains outgoing Letters DOM and compositor snapshots while
the gate arrives before the document becomes hidden. This interval does
not establish a foreground privacy pass. The first PNG after native
visibility returns contains only the PIN gate. The following 184 normal
and 178 reduced-motion DOM samples contain no letter or list rows, only
the `engender` gate, through 3068.7ms and 3281.5ms respectively. Each return
has one compositor frame because the gate then remains static; there is no
later journal repaint in the retained compositor sequence. Gate frames sit
in `native-extras-complete/populated-{no-preference,reduce}-native-gate-android-cast/`.

## Separate Settings acceptance

Ticket 01 evidence is in `.claude/ticket-01-native-final/`, with six captures
and 190 painted frames. Two entries into `/settings/trash` and system Back
restore Settings at 1951.238037109375px, with the same visible rows within
1px. Interrupted Back restores that position too. Fresh navigation to
Settings starts at 0px. Native Home and return show the PIN gate in the
first returned frame, `settings-native-gate-android-cast/009-1587ms.png`.
The gate is mounted at 465.3ms, the document is hidden at 756.3ms and visible
again at 1548.3ms; that first returned PNG is at 1587.4ms. This evidence is
kept separate from Letters.

## Retention and harness failures

The paused boot was resumed without resetting its journal. The original
paused log and all earlier web captures remain. The first native attempt
completed 32 ordinary captures and four extras before a preparation timeout:
PIN setup had succeeded, then the helper tried to remount a route under the
locked gate. A calendar-predecessor retry also timed out under that gate.
`native-resumed-ready/` and `native-extras-final/` retain those failures.
`native-harness-inspection/` records the locked DOM. The final diagnostic
runner unlocks the existing synthetic fixture and skips repeated PIN setup;
it does not change production navigation. Each evidence directory retains
`runner-used.mjs` and its SHA-256. `native-resumed-ready/report.json` records
the preparation timeout and has no `complete: true`; its first 32 ordinary
scenes passed their assertions before that failure. Only
`native-extras-complete/report.json` and
`.claude/ticket-01-native-final/report.json` have `complete: true`. All three
reports record zero runtime exceptions, independently of the preparation
failure. The four earlier extras are excluded from the 38 accepted captures.

The Android work used the orchestration memory gate. After Settings
verification the phone was released, forwarding port 9334 was removed, and
the isolated app was left installed and unlocked on Settings at 0px.

`npm run check` passes with zero errors and warnings. The first Node suite
run hit sandbox `EPERM` errors on subprocesses and loopback listeners. The
same suite with those permissions available passes all 580 files and 7542
tests. Both logs remain beside the native evidence. Production source is
unchanged; this commit records verification only.
