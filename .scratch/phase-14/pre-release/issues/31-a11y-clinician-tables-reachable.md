# 31 - a11y: Clinician summary tables are readable at phone width and reachable by keyboard

Status: ready-for-agent
Type: bug
Audit findings: A07, V09 (accessibility audit, 30 September 2026)
Severity: P1 in the accessibility audit (WCAG 2.1.1); V09 P3; wanted before release, not in the hard release gate
Blocked by: none
Size: M
Size note: one to two days
Model: sonnet
UI: yes. Mandatory `/impeccable` pass on the changed surfaces, then sign-off and the no-yank clause from the spec.

## Problem

**A07.** The `.dossier-table-wrap` containers (`ClinicianSummaryDossier.svelte:149,187,223`,
`clinician-print.css:73`) scroll horizontally with no keyboard entry: axe reports
scrollable-region-focusable on four on web and three on the Pixel at 390 px.

**V09 (moved here from ticket 17).** Six tables 336 to 625 px wide sit in a 306 px wrap with no
edge cue, so headers read "Intramus", "Post-do", "Dose tota". The range sentence appears twice;
Print uses the share icon; "im" and "Intramuscular" both appear.

Evidence: `docs/accessibility-audit-2026-09-30.html` (report) and `docs/accessibility-audit-2026-09-30/audit-evidence.zip` (`results/web.json`, `android.json`, `extra.json`, `details.json`, `visual.json`, `native-final.json`, `native-settings.json`, and `scripts/` to rerun the checks). The audit ran on `b00c17af`; on 3 October the source still shows the defect at `1a828acc` (checked by grep, not by rerunning axe).

## What to build

- A responsive presentation below about 400 px that keeps every column (stacked rows), or named,
  focusable scroll regions with a visible edge cue. Printed output unchanged.
- State the range once; Print gets a print icon; one way of writing the route.

## Acceptance

- [ ] Every column reachable by keyboard at 320 and 390 px; no scrollable-region-focusable.
- [ ] Printed summary identical to before (compare a print render).
- [ ] The audit's own acceptance check for each finding passes on web (axe, keyboard) and on Android (TalkBack tree), rerun with the audit's scripts.
