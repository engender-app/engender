# 30 - a11y: The yearly grid gives its daily values to people who cannot see them

Status: ready-for-agent
Type: bug
Audit findings: A06 (accessibility audit, 30 September 2026)
Severity: P1 in the accessibility audit (WCAG 1.1.1, 1.3.1); wanted before release, not in the hard release gate
Blocked by: none
Size: M
Size note: one to two days
Model: sonnet
UI: yes. Mandatory `/impeccable` pass on the changed surfaces, then sign-off and the no-yank clause from the spec.

## Problem

`src/lib/components/kit/YearRows.svelte:39-54` (in `WrappedYear.svelte`) paints 365 empty spans;
the date and value live only in `title` attributes, and month labels are `aria-hidden`. The
accessibility tree on `/wrapped/year` has no daily names. Aggregates elsewhere do not replace the
daily data.

Evidence: `docs/accessibility-audit-2026-09-30.html` (report) and `docs/accessibility-audit-2026-09-30/audit-evidence.zip` (`results/web.json`, `android.json`, `extra.json`, `details.json`, `visual.json`, `native-final.json`, `native-settings.json`, and `scripts/` to rerun the checks). The audit ran on `b00c17af`; on 3 October the source still shows the defect at `1a828acc` (checked by grep, not by rerunning axe).

## What to build

- A text or table view of dates and values from the same data, reachable by keyboard and touch
  without hover; month selection operable by keyboard. No 365 tab stops.
- Check whether the colour ramp alone carries meaning (WCAG 1.4.1) and add a non-colour cue if
  so.

## Acceptance

- [ ] A screen reader can read every day's value, including empty days.
- [ ] The equivalent view is reachable without hover.
- [ ] The audit's own acceptance check for each finding passes on web (axe, keyboard) and on Android (TalkBack tree), rerun with the audit's scripts.
