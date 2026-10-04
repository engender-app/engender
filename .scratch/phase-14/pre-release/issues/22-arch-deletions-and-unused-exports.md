# 22 - arch: Delete what nothing uses

Status: resolved
Type: cleanup
Audit findings: A5
Severity: P3, after release (not in the release gate)
Blocked by: 04
Blocked by note: (its roster test decides which probes are indexed or deleted)
Size: S
Size note: under a day
Model: sonnet
UI: no. No `/impeccable` pass.

## What to remove or fix

From the architecture reader's scan (`.claude/audit-2026-10-03/report-architecture.md`,
A5): exports checked by name against every source, test, script and Java file
outside `node_modules`. The scan matches names as text, so confirm each one with
a typecheck and the test suite before deleting.

- `getActiveFileOps` and the `activeFileOps` slot,
  `src/lib/stores/journal-ports.ts:33,39-41,45,53`: written by
  `boot.svelte.ts:707` through the second parameter of `setActiveDriver`, read
  by nothing. Delete the getter, the slot and the parameter.
- Probes with no index line, no npm script and no importer:
  `tests/android-tab-status-strip.mjs`, `journal-book-summary-signoff-page.mjs`,
  `lock-timing-gallery.mjs`, `milestone-shuffle-motion.mjs`,
  `onboarding-scales-cold.mjs`. Index or delete each, per phase-12 ticket 33's
  rule; ask Alicja about the gallery and sign-off pages before deleting them.
- The remaining unindexed `tests/*.mjs` that have npm scripts: index them (the
  roster test from ticket 04 will list them).
- `scripts/full-fixture-screen-shots.mjs`: no reference anywhere, last changed
  2026-09-04, a one-off for phase 5 ticket 36. Delete, unless ticket 20 adopted
  it for store screenshots.
- `scripts/generate-hub-icon-masks.mjs`: keep; add a one-line test that every
  `icon:` in `hubRows.ts` has a mask (19 of 19 today).
- Exports used only in their own file: `bandCentroid`, `focusableElements`,
  `trapFocus`, `lastLoggedDose`, `timeInputValue`, `PHOTO_SOURCES`,
  `PHOTO_CHIPS`, `NEUTRAL_TAB_ICON`, `isDatabaseLockedError`,
  `VOICE_METRICS_ROUTE`, `settleCurve`, `iterationProgress`,
  `FIELD_NAMED_BAND`. Drop the `export` keyword; no behaviour change. Leave the
  roughly 70 exported types alone.
- Phase 9 ticket 99's note: `statsAreas.ts`, its test and `statsAreaLabels.ts`
  had no caller in September; check and delete if still true.

## Acceptance

- [ ] Each item deleted, indexed, or kept with a reason in Comments.
- [ ] Typecheck, the node tier and the guards pass.
- [ ] The hub icon mask test exists.
