# 33 - a11y: Home-screen widget buttons reach 48 dp

Status: ready-for-agent
Type: bug
Audit findings: A09 (accessibility audit, 30 September 2026)
Severity: P2 in the accessibility audit (Android target guidance); wanted before release, not in the hard release gate
Blocked by: none
Size: S
Size note: under a day
Model: sonnet
UI: yes. Mandatory `/impeccable` pass on the changed surfaces, then sign-off and the no-yank clause from the spec.

## Problem

`android/app/src/main/res/values/styles.xml:27`: `WidgetMoodButton` is 40 dp high, shared by the
quick-log, tally and doubt widgets. Accessible names come from `DisguisableWidgetProvider` and are
suppressed under disguise on purpose. Source review only; no launcher run.

Evidence: `docs/accessibility-audit-2026-09-30.html` (report) and `docs/accessibility-audit-2026-09-30/audit-evidence.zip` (`results/web.json`, `android.json`, `extra.json`, `details.json`, `visual.json`, `native-final.json`, `native-settings.json`, and `scripts/` to rerun the checks). The audit ran on `b00c17af`; on 3 October the source still shows the defect at `1a828acc` (checked by grep, not by rerunning axe).

## What to build

- 48 dp targets, keeping widget layout and resize behaviour and the disguise naming.
- Mount all three widgets on a launcher (the `.test` build on the shared phone, your own adb
  forward only) and measure the bounds; check TalkBack names in ordinary and disguise modes.

## Acceptance

- [ ] All three widgets' buttons measure at least 48 dp on a launcher.
- [ ] TalkBack names correct in both modes; layout unchanged at the default widget size.
- [ ] The audit's own acceptance check for each finding passes on web (axe, keyboard) and on Android (TalkBack tree), rerun with the audit's scripts.
