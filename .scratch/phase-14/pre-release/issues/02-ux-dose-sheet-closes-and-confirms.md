# 02 - ux: The dose sheet closes and confirms after a save

Status: ready-for-agent
Type: bug
Audit findings: V01, V15 (dose sheet half)
Severity: P1, blocks release
Blocked by: none
Size: S
Size note: under a day
Model: sonnet
UI: yes. Mandatory `/impeccable` pass on the dose sheet and the dose log, then
sign-off and the no-yank clause from the spec.

## Problem

Logging a dose from Care's "Log a dose", from Quick add, or from the Today tile
saves the dose and then reopens the same sheet empty. There is no
confirmation, so a person may log the dose a second time.

Cause: `src/routes/care/doses/+page.svelte:226-243`. The effect reads
`page.url.searchParams.get('add')` and clears it with
`replaceState('/care/doses', {})`. SvelteKit's `replaceState` never updates
`page.url`, so `add=1` is still there and the effect opens the editor again
after the save. Project memory has this exact trap
(`shallow-routing-never-updates-page-url`): use `replaceRoute` from
`src/lib/navigation/smart-back.ts:79`.

Entry points that pass `?add=1`: `src/routes/care/+page.svelte:343`,
`src/lib/components/QuickAdd.svelte:439`, `src/lib/data/liveTiles.ts:753,904`.
The dose log's own + button and the measurement sheet close normally.

Evidence: `.claude/audit-2026-10-03/ux2/flow5.mjs`, `flow6.mjs`;
`ux2/flow/D3-after-save-600.png` (saved dose is the top row behind a reopened,
empty sheet), `D4-dose-6s.png`, `Q-after-save.png`.

Dose sheet polish found in the same run (V15): the reopened sheet shows
"Enter a dose amount. Choose which drug this dose is for." before any input;
amount and unit share one box about 130 px wide; the sheet ends 12 px above
the screen bottom with the page showing under it
(`ux2/flow/D1b-site-picked.png`). The live region keeps "Choose an injection
site." after a save.

## What to build

- Clear the parameter with `replaceRoute`, or make the effect run once per
  navigation, so the sheet opens once per arrival.
- On save the sheet closes and the save confirms itself the way other saves
  do (brief, floating, live region, no focus move).
- Validation messages appear only after an attempt or a blur, not on open.
- Give amount and unit room; the sheet reaches the bottom edge.
- A browser guard: arrive with `?add=1&drug=...`, pick a site, save; the sheet
  is closed, the row exists once, and the confirmation was announced. Add it
  to the guard list ticket 04 creates (or `package.json` if 04 has not landed).

## Acceptance

- [ ] From Care, Quick add and the Today tile, one save writes one dose, closes
      the sheet and confirms.
- [ ] Back after the save does not reopen the sheet.
- [ ] No validation text before input; the live region is clear after a save.
- [ ] `/impeccable` pass done; sign-off crops of the sheet before and after,
      trans light and dark.
- [ ] Sheet close and confirmation sampled per frame: no yank.
