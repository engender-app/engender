# 02 - Put Privacy & data at the end of Settings sections

Status: ready-for-agent
Size: S
Model: gpt-6.1-sol
Type: UX
Blocked by: None
UI: yes

## What to build

Move Privacy & data below Your lists and above About. Its controls remain available and retain their existing behavior. This reverses the earlier choice to place Lock near the top after a release audit; the tester found that order wrong for routine Settings use.

## Acceptance

- [ ] Settings sections read Appearance, Tracking, Reminders & prompts, Your lists, then Privacy & data in both languages.
- [ ] Lock, disguise, archive, permissions, Trash and deletion controls still work and remain reachable at 390px and 200% zoom.
- [ ] Update the screen contract and any order assertions. Verify no abrupt layout jump when a Settings sheet closes.

Source: 11 October recording at 18:11.
