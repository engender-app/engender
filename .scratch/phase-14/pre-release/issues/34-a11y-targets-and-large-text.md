# 34 - a11y: Controls reach the 48 px floor, and navigation survives large text

Status: ready-for-agent
Type: bug
Audit findings: A10 (chips and segmented), A11, V13 (accessibility audit, 30 September 2026)
Severity: P2 in the accessibility audit; V13 P3; wanted before release, not in the hard release gate
Blocked by: none
Size: M
Size note: one to two days
Model: sonnet
UI: yes. Mandatory `/impeccable` pass on the changed surfaces, then sign-off and the no-yank clause from the spec.

## Problem

**A10.** Entry tag and presentation chips are about 40.5 px high; some segmented options about
38.5 px wide. Passes WCAG 24 px, misses the project floor.

**V13 (moved here from ticket 19).** Letters calendar and delete icons 36 x 36; Milestones era
rail 20 px wide; Settings unit toggles (cm 28 x 48, in 20 x 48) and theme (Light 43 x 48, Dark
41 x 48); Wear chips (7d 39 x 48, femme 77 x 41, androgynous 119 x 41); clinician summary
"4 mg" link 35 x 48.

**A11.** At Android font scale 2.0 the bottom navigation labels truncate to "Jour...", "Loo...",
"Tran..." (`android-native-text-200.png`); names stay in the accessibility tree.

Evidence: `docs/accessibility-audit-2026-09-30.html` (report) and `docs/accessibility-audit-2026-09-30/audit-evidence.zip` (`results/web.json`, `android.json`, `extra.json`, `details.json`, `visual.json`, `native-final.json`, `native-settings.json`, and `scripts/` to rerun the checks). The audit ran on `b00c17af`; on 3 October the source still shows the defect at `1a828acc` (checked by grep, not by rerunning axe).

## What to build

- Fix hit areas on the shared kit styles (chip, segmented control, icon button), with
  `::after` extensions where the visual size must stay; check every consumer.
- A large-text navigation layout that keeps full names (stacked labels, icon-only with a visible
  label row, or fewer words); decide on render.

## Acceptance

- [ ] Every listed control meets 48 px/dp at 320 and 390 px, with no overlap and no lost labels
      at 200% text.
- [ ] At Android font scale 2.0 all navigation names are legible in full.
- [ ] The audit's own acceptance check for each finding passes on web (axe, keyboard) and on Android (TalkBack tree), rerun with the audit's scripts.
