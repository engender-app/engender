# 35 - a11y: Chart graphics that carry meaning have contrast

Status: ready-for-agent
Type: bug
Audit findings: graphics-contrast note in the accessibility audit (accessibility audit, 30 September 2026)
Severity: P2 (source-proven risk, not a verified failure); wanted before release, not in the hard release gate
Blocked by: none
Size: S
Size note: under a day
Model: sonnet
UI: yes. Mandatory `/impeccable` pass on the changed surfaces, then sign-off and the no-yank clause from the spec.

## Problem

`PitchFigure.svelte` draws the voice-density contour in raw `--role-draw`; the palette test pins
the nonbinary light contour at 1.13:1 against its band wash. Text contrast tests do not cover
essential chart graphics (WCAG 1.4.11 asks 3:1 for graphics that carry meaning).

Evidence: `docs/accessibility-audit-2026-09-30.html` (report) and `docs/accessibility-audit-2026-09-30/audit-evidence.zip` (`results/web.json`, `android.json`, `extra.json`, `details.json`, `visual.json`, `native-final.json`, `native-settings.json`, and `scripts/` to rerun the checks). The audit ran on `b00c17af`; on 3 October the source still shows the defect at `1a828acc` (checked by grep, not by rerunning axe).

## What to build

- Decide whether the contour carries essential information. If it does, keep the flag colour
  and add a contrasting boundary or a visible data equivalent.
- Sweep other charts for the same pattern (raw role colour on a wash) and extend
  `palette-contrast.test.ts` to essential graphics, all 16 palettes in both themes.

## Acceptance

- [ ] Every essential chart graphic is at least 3:1 against its ground in every palette and theme,
      enforced by the palette test.
- [ ] The audit's own acceptance check for each finding passes on web (axe, keyboard) and on Android (TalkBack tree), rerun with the audit's scripts.
