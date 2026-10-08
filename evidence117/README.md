# Settings narrow layout proof

Ticket 117 changes only the Settings theme and measurement-unit layout below a 240px app container. The theme row uses the existing screen inset to give three 48px segments room. Labels can wrap when needed. The measurement-unit title keeps a minimum word width rather than its entire single-line width. Wider layouts retain their existing rules.

## Reproduction

Base: `606b2b1f812e1879e6fe8850d488e9737ddbccf8`.

The independent before capture reproduces both defects in both themes at a 195px viewport: Theme measures 212.125px against 185px available app width; Measurement units measures 152.796875px inside a 145px row. The baseline screenshots and geometry are under `before/`.

The paired after captures in `after/` cover 195px, 390px and 1280px, light and dark. At 195px, Theme remains within 185px available width, and the units title wraps within its 145px row. App scroll width and client width both measure 185px. Existing 390px and desktop layouts remain unchanged.

Run the captures against a demo build:

```sh
VITE_DEMO=1 npm run build
node evidence117/settings-narrow.mjs after
node evidence117/settings-matrix.mjs
```

The matrix records 768 cases: two languages, three widths, two themes, sixteen palettes, two motion preferences and two controls. Every group stays within the viewport without internal horizontal scrolling. All measured buttons remain at least 48px wide and high; group names and option names remain present. Arrow keys and Space update selection while retaining focus. Theme and measurement-unit selections survive reload.

## Impeccable audit and polish

This is a local responsive defect in the existing Operate surface. The audit covered layout, target geometry, accessible group and option names, keyboard selection, token-based theming and reduced motion. The scoped CSS introduces no colors, animation or new controls. The detector reported no findings in `screens.css`; its JSON output is included.

The visual pass inspected the narrow Theme and units captures together with 390px and desktop. An initial equal-width candidate split the English System label; the final candidate preserves intrinsic label widths while allowing longer Polish labels to wrap. No additional polish changes were needed. Browser captures verify the shared web bundle; no phone or Android runtime was used.

Svelte autofixer reported existing Settings effects and the existing external Ko-fi href. This ticket edits no Svelte component, effect, navigation or copy.

The production build, check, Node and guard results are recorded in `checks.txt`. The broad browser-tier run was inconclusive: a production build regenerated files while its dev server was active and caused reloads; that run also timed out on a Cross-area source records click intercepted by a sheet scrim. Its log is preserved without attributing those failures to main or this ticket. The frozen-bundle matrix is the focused acceptance proof. Separate Standards and Spec reviews inspect the committed candidate in independent worktrees. Their results are retained in this directory.
