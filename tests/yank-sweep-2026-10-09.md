# Full web and Pixel yank sweep, 9 October 2026

Status: complete. Coverage passed; confirmed and unresolved motion findings remain.

Ticket: `.scratch/phase-15/ux-carpet/issues/120-full-web-and-device-yank-sweep.md`.
The product baseline is ux-carpet integration `44576326`. Ticket 120 changes
the measurement tools, not application motion.

## Scope and provenance

Run all 73 gesture scenes plus the injected proof, with three repeats in
light/dark and populated/empty journals. Run all 88 cold-load scenes plus
the proof once per applicable theme/profile. Onboarding and PIN gates are
included. Each surface requests 702 gesture runs and 326 cold-load runs.

The web runs cover 390x844 and 1280x900 CSS viewports in Chromium
154.0.8037.57. Physical-device runs use a Pixel 10a, Android 17, Vanadium
WebView 154.0.8037.126.0, with a 1080x2424 display at 420 dpi.

The shared build is `1791552713800`, version
`0.0.0-dev+g44576326.dirty`, schema 88. The dirty marker came from Capacitor
sync rewriting generated relative dependency paths; that change was
restored. No product source was edited. Installed and local APK SHA256:
`60f17a082d4a33d4d3a6de343c346cbf5b04197b668b59e36df9d9bc387d6cc0`.
All 954 built files match their packaged equivalents, including the two
OCR assets that Android packages decompressed.

Initial web startup attempts failed on incomplete generated message
exports, before any scene ran. They are excluded. Explicit Paraglide
compilation and vendor preparation preceded the replacement build.

Narrow-web and native gesture runs started with the baseline runners.
Desktop runs and subsequent cold runs use the viewport repair in
`ef4e80ee`: configurable web viewport, visible desktop door selectors and
a wider injected bloat above 600px. Default viewport, narrow/device proof
geometry, sampler and defect thresholds remain unchanged. Source hashes
for both runner versions are retained with the evidence.

## Results

All 3,084 requested runs are accounted for: 3,068 measured and 16 explicit
Android-only exclusions on web. No setup, action, route, capture or page
errors remain. Counts below include the 48 injected-proof runs; candidate
columns exclude those proof runs.

| Matrix / evidence directory | Requested | Measured | Excluded | Failed | Style candidates | Paint candidates |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Web 390x844 gestures, `web-gestures-fresh` | 702 | 696 | 6 | 0 | 337 | 271 |
| Web 1280x900 gestures, `desktop-gestures` | 702 | 696 | 6 | 0 | 1,060 | 151 |
| Pixel gestures, `device-gestures` | 702 | 702 | 0 | 0 | 3,439 | 272 |
| Web 390x844 cold, `web-cold` | 326 | 324 | 2 | 0 | 17 | 20 |
| Web 1280x900 cold, `desktop-cold` | 326 | 324 | 2 | 0 | 24 | 9 |
| Pixel cold, `device-cold` | 326 | 326 | 0 | 0 | 57 | 30 |
| Total | 3,084 | 3,068 | 16 | 0 | 4,934 | 753 |

All 48 injected style and painted proofs passed. The independent audit
checked the current full inventory, duplicate identities, action and cold
load proofs, style-sample sufficiency, chronology and evidence files. It
found no problems across 3,068 casts and 131,918 painted frames. This is
complete coverage of the declared matrices, not a claim that motion is
free of defects.

## Findings

Two fresh, reproduced findings have separate implementation tickets:

- **121: Look back text collision.** The outgoing empty-span explanation
  and incoming Wrapped link share painted space after ticket 112's fix.
  Narrow web, populated/light repeats 1 and 2: frame 5 at 80 ms and 67 ms.
- **122: Android outgoing door cut.** Today-to-Journal removes outgoing
  content before the incoming fade. All three populated/light repeats
  report 47 style findings. Repeat 1's painted frames 15 and 16 are at
  226 and 272 ms; the 46 ms capture gap limits the timing claim. The DOM
  trace separately records outgoing removal at 194 ms and opacity 1.

Reviewed candidates also include intended navigation crossfades, clipped
heading reveals in Voice and Roadmap, offscreen Eras pill initialization,
rows traveling with a withdrawing sheet and the desktop date picker
unrolling behind an ancestor clip. These observations apply to the named
samples in `observations.md`, not every superficially similar finding.
The first-line arrival when opening a letter and cold-load geometry changes
beneath the startup veil remain unresolved.

The ledger contains 1,159 candidate families, all unresolved at the family
level. Named observations classify individual reviewed samples; they do
not clear every profile, theme or repeat in that family. The two reproduced
product findings above have separate tickets. Detector totals are not
defect counts. Injected-proof runs are excluded from candidate totals.
One inspected native Home cold-load dropout is pre-navigation carryover:
the cast retains the preceding injected-proof scene before the startup
logo. No blank sentinel was captured, so the existing filter left those
frames intact. Raw totals exclude proof runs but include this named
artifact in the Home run; the new document's hydration is still captured.

## Evidence and verification

Evidence directory:
`.claude/worktrees/ticket-120-full-yank-sweep/.claude/evidence120/`.
Keep this worktree while its captures are referenced.

`index.html` provides searchable scene selection, frame stepping, playback
and timestamps. `observations.md` records visual attribution. Each matrix
has its full log, report, DOM samples and compositor PNGs with frame
manifests. `build-apk-audit.json` records build equivalence. The completed
`audit.json` records coverage, action proofs, injected defects, missing
files, sample sufficiency and capture chronology; `finding-families.json`
groups candidates. `audit.mjs` reproduces the independent checks and
`build-viewer.mjs` regenerates the viewer from the saved reports.

Viewport validation failed before implementation. The corrected desktop
smoke measures all four door directions and detects every injected style
defect plus the painted proof. Typecheck passes with zero errors and zero
warnings. The updated Node suite passes 7,326 tests in 567 files. Copy,
licence and screen-class checks pass. The first-load check explicitly does
not gate demo builds; no production bundle change is part of this ticket.

The device ends unlocked, with only `dev.engender.app` installed. The
other Engender packages were removed without retaining data, as requested.
USB stay-awake was restored to 0 and the owned CDP forward was removed.
`device-final-state.json` records the ready, unlocked app state.

## Limits

Full means the declared scene matrices, not every possible input or
credential state. See [the inventory boundaries](yank-sweep-inventory.md#boundaries)
for unmeasured biometric/recovery gates, OS surfaces, midnight changes,
confirmed writes and drag interactions. Web reminder scenes are explicit
Android-only exclusions. This is not an all-palette audit.

The existing compositor transport caps images at 390x844. The desktop
viewport produces 390x274 PNGs; the physical WebView produces 376x844 PNGs.
DOM geometry uses actual CSS dimensions. Sparse frames and clipping can
limit visual attribution even when a scene's action and route are proven.
Web matrices ran in separate browser processes, with some runs concurrent.
Their timings describe these captures, not an isolated performance benchmark.
