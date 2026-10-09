# Ticket 117 Spec review

Candidate: `7cdb58e0a12ba7a246448336efc193b95957e8a8`.

Verdict: PASS. No actionable Spec findings.

Reviewed exact SHA in detached worktree `.claude/worktrees/spec-117-7cdb58e`.
Changes since prior PASS `61a7243ef46fddd22efda8b7262cf4acc43a70eb` are limited to the selector targeting theme options through `[data-segment]` and moving the existing narrow sun-header declaration to its original position in the container block. The selector targets the real Segmented buttons and keeps prior specificity. No screen capability, label, route, preference behavior or focus behavior changed.

Baseline captures at 195px reproduce both ticket defects in light and dark: Theme group width is 212.125px against 185px available; Measurement units title is 152.797px inside a 145px row. Candidate captures show Theme within 185px and all options visible; Measurement units title wraps within its row. All option targets remain at least 48px. At 390px and 1280px, paired captures retain existing layout. I inspected narrow light and dark screenshots; labels remain readable and both controls fit without horizontal scroll.

Focused browser matrix covers 768 cases: English and Polish, 16 palettes, light and dark, normal and reduced motion, 195px/390px/1280px, and both controls. Results report no group or row overflow; accessible names remain present; arrow and Space selection retain focus; selections persist after reload. Refreshed evidence records `768 layout cases passed; keyboard and reload persistence passed`.

Fresh exact-SHA verification in `evidence117/refresh-109/` supersedes stale initial logs: production and demo builds pass; Svelte check reports zero errors and warnings; Node tier passes 7,314 tests; copy, licences and screen-class checks pass; impeccable detector is empty. In particular, initial `evidence117/screens-classes.log` records two failures and is stale for this refresh. `refresh-109/screens-fixed.log` passes all 103 screen classes at reviewed SHA. Broad browser tier remains inconclusive from build regeneration and a sheet-scrim timeout; focused matrix covers ticket acceptance. No phone or Android runtime used.

No actionable Spec findings. Detached review worktree removed after inspection. No source edits made.
