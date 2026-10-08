# Ticket 111: Transition summary containment

## Root cause and change

`ListRow` keyed each subtitle by its text. When a read replaced that text,
`crossfade` took the outgoing block out of flow without pinning its position.
Its static position followed the incoming summary. The old description then
painted below Care and across the Surgery journey title. The text column's
resize clip did not contain that absolute child because the column was not
its containing block.

Each subtitle now keeps a stable slot by index and keys the words inside it.
Outgoing words are pinned to the start of that slot. Positioned slots and a
positioned text column contain them; opted-in columns keep their overflow
clipped before ResizeObserver starts and after it finishes. The existing
`resize` action still moves following rows when the replacement changes
height. Non-swapping rows retain their immediate text replacement.

Route reads, forward dates, recency formatting, search, navigation and module
visibility were not changed. Links remain native anchors. The probe checks
keyboard focus and Care's destination. Reduced motion retains instant resize
and the motion system's existing fade substitute.

## Rendered proof

Evidence root, retained outside Git:
`/home/alice/_projekty/priv/gender-diary/.claude/phase-15-ux-carpet-delivery/111/`.

The final probe runs against the real ListRow and real styles. `--paint`
colors outgoing words red and Surgery's title blue, then reads both colors
from the same screenshot. Red ink in the blue title's painted vertical band
fails. Geometry samples also check text containment; geometry alone is not
claimed as measured paint. Screenshot names retain capture sequence and the
sampled milliseconds when the screenshot was requested. Sweep screencasts
retain ticket 101's capture-clock chronology.

- `painted-final-probe-before-ready/`: clean delivery base `0d9871ab`, final
  probe copied into a separate baseline worktree. Light and dark each fail
  with one painted collision capture and five geometry collision samples.
  Reduced-motion controls have no painted collisions.
- `painted-final-probe-after/`: same final probe, fixed source, zero painted
  or geometry collisions across both themes and both motion preferences.
- `matrix-painted-same-frame/`: 24 cases across 230, 430 and 1024px,
  shrinking/growing summaries, light/dark and reduced motion. All pass.
- `probe-before/` and `probe-after-clipped/`: natural paired captures.
  Before light `002-56ms` visibly crosses Surgery; after light `002-91ms`
  remains inside Care. Both directories contain corresponding dark frames.
- `sweep-before/` and `sweep-after/`: persona Look back to Transition,
  three passes per theme. Each run covers six measured passes with zero
  skipped/failed/missing scenes and zero style/render yanks. Desktop sweep
  does not reproduce the physical phone timing; focused held replacement
  supplies the red control. No phone used.

Failed casts remain: `probe-after/` documents why anchoring alone was
insufficient. `matrix-after/` preserves a detector false positive caused by
comparing a screenshot against later DOM bounds; the final detector instead
reads both colors from the same PNG. `painted-final-probe-before/` preserves
a baseline attempt missing generated SvelteKit config. `build-after.log`
preserves a locale-shell failure caused by temporarily restoring baseline
source during a build. Final build ran with stable fixed source.

Reproduce:

```sh
node tests/transition-summary-overlap.mjs /tmp/111-proof --paint --matrix
VITE_DEMO=1 npm run build
node tests/yank-sweep.mjs --scenes door-lookback-transition \
  --profiles persona --themes light,dark --passes 3 --out /tmp/111-sweep
```

## Impeccable audit and polish

Loaded context for `/more`, audit, native audit, polish and craft floor.
This changes the shared web bundle of the adaptive app; desktop browser
captures cover that bundle. Native hardware sign-off remains outside this
candidate's evidence.

Scope-local audit:

| Dimension | Score | Finding |
| --- | --- | --- |
| Accessibility | 3/4 | Native links and focus pass; reduced motion passes. TalkBack was not exercised. |
| Performance | 3/4 | Existing height-motion exception retained; no new observers or dependencies. Hardware cadence was not measured. |
| Responsive design | 4/4 | Shrink/grow containment passes at 230, 430 and 1024px. |
| Theming | 4/4 | Real light/dark tokens retained; no color/token changes. |
| Implementation integrity | 4/4 | Existing ListRow and resize own the fix; detector reports no findings. |

Total: 18/20 for this bounded change. Verified P2 defect was summary paint
escaping its row. Polish corrected the containing blocks and line slots;
natural paired captures confirm Care and Surgery remain separate. No adjacent
restyling or copy changes. Existing screen/data capabilities remain in their
own unchanged route paths.

## Checks and review handoff

`build-final.log`: successful demo-enabled locale build.
`check-final.log`: zero errors and warnings.
`node-final.log`: 565 files, 7,314 tests pass.
`copy.log`, `screens.log`, `licences.log`: pass.
`impeccable-detector.json`: no findings.
`autofixer-fixture.log`: no findings. Source autofixer flags existing dynamic
hrefs and suggests attachments instead of the existing resize action; neither
belongs to this repair.
`budget.log`: demo output explicitly not gated by the production first-load
budget. No production-budget claim.

The initial Node run failed the new probe's missing roster entry and six
module-preload tests against the interrupted build. The roster was updated;
the full suite passes against the successful final build. Main's latest CI
was checked: successful run 37790345794 at `f4672539`. These failures were
not attributed to main.

Fresh Luna Standards and Spec reviews belong to the root's handoff, in
separate review worktrees on this committed candidate. No integration,
issue-status change or main modification performed here.

## Standards review correction

Review of candidate `3a95f00c` found that the fixture emulated the browser's
reduced-motion media query but never set the app's `data-a11y-motion` setting.
The earlier reduced-motion captures therefore exercised normal app motion.
Those captures remain archived; their reduced-motion claims are superseded.

The fixture now reads `motion=reduce|full` before mounting ListRow and sets
the app's attribute before the resize action decides whether to observe.
The runner retains browser media emulation too. Every reduced-motion sample
must have zero active height animations; results record the app attribute
and the explicit reduced-path assertion.

`baseline-app-motion/` reruns the corrected final probe against delivery base
`0d9871ab`. Normal light and dark each fail with one painted collision and
five geometry collisions. Actual reduced-motion controls pass with no height
animations. `matrix-app-motion/` reruns all 24 fixed cases with the actual app
setting: no painted or geometry collisions, keyboard checks pass, and every
reduced-path assertion passes. No product source changed for this correction.

`check-app-motion.log`, `node-app-motion.log` and `copy-app-motion.log` record
the affected verification rerun. The existing successful build and navigation
casts still represent the unchanged product source.
