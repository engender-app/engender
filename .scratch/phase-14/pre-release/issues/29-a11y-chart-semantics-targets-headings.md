# 29 - a11y: Charts expose their controls, have room to tap, and fit the heading order

Status: ready-for-agent
Type: bug
Audit findings: A04, A05, A12 (accessibility audit, 30 September 2026)
Severity: P1 (A04, A05), P2 (A12) in the accessibility audit; wanted before release, not in the hard release gate
Blocked by: none
Size: M
Size note: one to two days
Model: sonnet
UI: yes. Mandatory `/impeccable` pass on the changed surfaces, then sign-off and the no-yank clause from the spec.

## Problem

**A04, targets.** `NoticedAxis.svelte:201` buttons are 22 x 18 CSS px (also the audit's V10, which
ticket 17 no longer carries); `SpanTimeline.svelte:643,663` history bands are 8 or 6 px high and
markers 12 x 12 (also U18, which ticket 18 no longer carries). Axe reports target-size on
`/care/changes` and `/stats`.

**A05, controls inside an image.** `HormoneBandChart.svelte:113` declares `role="img"` while
`CurveMarkers.svelte:194` adds focusable `role="button"` children. Axe reports nested-interactive
on `/care/curve`.

**A12, headings.** `kit/ChartCard.svelte:40` always emits `h3`, sometimes straight after the
screen's `h1` (measurements, wear, labs, stats readings, some sheets).

Evidence: `docs/accessibility-audit-2026-09-30.html` (report) and `docs/accessibility-audit-2026-09-30/audit-evidence.zip` (`results/web.json`, `android.json`, `extra.json`, `details.json`, `visual.json`, `native-final.json`, `native-settings.json`, and `scripts/` to rerun the checks). The audit ran on `b00c17af`; on 3 October the source still shows the defect at `1a828acc` (checked by grep, not by rerunning axe).

## What to build

- Keep small marks but give them non-overlapping hit areas of 48 px; where marks are too dense,
  an accessible list of the events beside the chart.
- The curve chart becomes a labelled group whose markers are separate named controls, or the
  markers move outside the image.
- ChartCard takes its heading level from the screen that places it.

## Acceptance

- [ ] Every chart target meets 24 px (WCAG) and the 48 px/dp project floor, or has a list
      equivalent.
- [ ] Each curve marker is a separately named control that works by keyboard and TalkBack.
- [ ] Heading order is unbroken on every screen with a ChartCard.
- [ ] The audit's own acceptance check for each finding passes on web (axe, keyboard) and on Android (TalkBack tree), rerun with the audit's scripts.
