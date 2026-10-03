# 28 - a11y: The expanded calendar is either a real grid or a list of links

Status: ready-for-agent
Type: bug
Audit findings: A03, A10 (calendar half) (accessibility audit, 30 September 2026)
Severity: P1 in the accessibility audit (WCAG 1.3.1, 4.1.2); wanted before release, not in the hard release gate
Blocked by: none
Size: M
Size note: one to two days
Model: sonnet
UI: yes. Mandatory `/impeccable` pass on the changed surfaces, then sign-off and the no-yank clause from the spec.

## Problem

**A03.** `src/lib/components/HeatMap.svelte:531` puts `role="grid"` on `.cal-grid`, which holds
plain links with no rows or gridcells. Axe reports aria-required-children once the calendar is
expanded (`[data-cal-open]`); a route-only scan misses it.

**A10, calendar half.** Expanded dates measure about 41.7 x 60.7 CSS px on web and 46.2 x 65.2
on the Pixel, under the project's 48 px/dp floor.

Evidence: `docs/accessibility-audit-2026-09-30.html` (report) and `docs/accessibility-audit-2026-09-30/audit-evidence.zip` (`results/web.json`, `android.json`, `extra.json`, `details.json`, `visual.json`, `native-final.json`, `native-settings.json`, and `scripts/` to rerun the checks). The audit ran on `b00c17af`; on 3 October the source still shows the defect at `1a828acc` (checked by grep, not by rerunning axe).

## What to build

- Pick one: full grid semantics with its keyboard model (arrows move by day and week, one tab
  stop), or a labelled list of date links. Decide on render with the keyboard behaviour shown.
- Date targets reach 48 px without overlap; keep the visual cell if needed.

## Acceptance

- [ ] Expanded dates keep their names; keyboard behaviour matches the chosen semantics.
- [ ] No aria-required-children violations; date targets meet 48 px/dp.
- [ ] The audit's own acceptance check for each finding passes on web (axe, keyboard) and on Android (TalkBack tree), rerun with the audit's scripts.
