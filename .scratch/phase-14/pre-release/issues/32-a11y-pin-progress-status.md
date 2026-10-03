# 32 - a11y: PIN progress is announced from a real status node

Status: ready-for-agent
Type: bug
Audit findings: A08 (accessibility audit, 30 September 2026)
Severity: P2 in the accessibility audit (WCAG 4.1.2, 4.1.3); wanted before release, not in the hard release gate
Blocked by: none
Size: S
Size note: under a day
Model: sonnet
UI: no. Nothing renders differently; only the accessibility tree changes. No `/impeccable` pass.

## Problem

`src/lib/components/PinPad.svelte:55`: `.pin-dots` is a plain `div` carrying `aria-label`. Axe
reports aria-prohibited-attr in six gate scene and theme combinations.

Evidence: `docs/accessibility-audit-2026-09-30.html` (report) and `docs/accessibility-audit-2026-09-30/audit-evidence.zip` (`results/web.json`, `android.json`, `extra.json`, `details.json`, `visual.json`, `native-final.json`, `native-settings.json`, and `scripts/` to rerun the checks). The audit ran on `b00c17af`; on 3 October the source still shows the defect at `1a828acc` (checked by grep, not by rerunning axe).

## What to build

- Expose the count as a status (or visually hidden count text) that updates as digits are
  entered and announces only how many, never which.

## Acceptance

- [ ] The count is in the accessibility tree and updates without revealing digits.
- [ ] No aria-prohibited-attr in the PIN scenes (gates gallery).
- [ ] The audit's own acceptance check for each finding passes on web (axe, keyboard) and on Android (TalkBack tree), rerun with the audit's scripts.
