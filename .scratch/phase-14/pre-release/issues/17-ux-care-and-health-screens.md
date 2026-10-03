# 17 - ux: Care and health screens say what they mean

Status: ready-for-agent
Type: bug
Audit findings: V03, V07, V10, V11 (V09 moved to 31; V10 hit areas to 29)
Severity: P2 (V03, V07), P3 (rest)
Blocked by: 02
Blocked by note: (same dose log screen; land the sheet fix first)
Size: M
Size note: one to two days
Model: sonnet
UI: yes. Mandatory `/impeccable` pass on each changed screen, then sign-off
and the no-yank clause from the spec.

Evidence for all: `.claude/audit-2026-10-03/ux2/` (`shots/seg/`, `shots/sg/`),
`report-ux2.md`.

## Problems and fixes

- **V03, "Archived" under Ongoing.** `health/surgery/+page.svelte:60-64`
  groups by the user flag `procedure.archived`, while
  `ProcedureRecoveryCard.svelte:82,94` labels the automatic phase after 90 days
  `surgery_phase_archived` ("Archived"). So "top surgery · Archived · Day 400"
  sits under "Ongoing procedures". Rename the phase ("Healed" or "Past
  recovery"; ask Alicja) or group by phase.
- **V07, the dose log is 15,163 px of flat rows.** About 200 rows, no day
  grouping, each ending "under Sertraline" right after "Sertraline 50 mg ·
  Oral", which forces titles onto two lines (`doses_under_episode` in
  `care/doses/+page.svelte`). Drop the episode label when it repeats the drug,
  group by day, batch older rows behind a "show more" the way the tryout list
  does.
- **V10, Changes you've noticed.** The legend swatch for "Not tied to a
  direction" is a white dot on near-white while the chart draws hollow grey
  rings; "Shaded bands describe the literature" shows with no bands; 16 point
  buttons are 22x18 (`care/changes/+page.svelte:396`, `effectDirections.ts:23`).
  Match the swatch to the mark and show the sentence only with bands. (The
  22x18 hit areas are ticket 29, A04.)
- **V11, two uncaptioned charts.** `care/+page.svelte:826-870`: the 7-day
  injection cycle and the 28-day fold are stacked with no titles, and the
  second's "5.0" touches the first's "Day 1 / Day 7". Caption both; separate
  them.

## Acceptance

- [ ] No procedure under Ongoing reads Archived.
- [ ] Dose log grouped by day, titles on one line at 390 px, older rows
      batched.
- [ ] Changes chart legend matches its marks; no sentence about absent bands.
- [ ] Both Care charts captioned and clear of each other.
- [ ] `/impeccable` pass done; sign-off crops per change, trans light and dark.
- [ ] Batched rows revealing, and any regrouping, sampled per frame: no yank.
