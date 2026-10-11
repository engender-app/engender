# 10 - Repair hair-removal interaction jumps

Status: ready-for-agent
Size: M
Model: gpt-6.1-sol
Type: bug
Blocked by: 08, 09
UI: yes

## What to build

The tester saw abrupt visual shifts while adding a hair-removal item, scrolling and moving back through the screen. Reproduce each reported path against the session-first layout, then repair the transitions at the layer that owns them.

## Acceptance

- [ ] Keep before and after painted captures for empty and populated add, scroll and back paths. Identify the actual jumps before changing motion.
- [ ] Content enters, moves and leaves without a one-frame teleport or delayed disappearance. Added sessions and region state remain correct after back navigation.
- [ ] Check web and Android, light and dark, interrupted navigation and reduced motion. No stale content survives a gate.

Source: 11 October recording at 18:24.
