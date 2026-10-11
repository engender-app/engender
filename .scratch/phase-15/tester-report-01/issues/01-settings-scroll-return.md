# 01 - Preserve Settings scroll position on return

Status: ready-for-agent
Size: M
Model: gpt-6.1-sol
Type: bug
Blocked by: None
UI: yes

## What to build

After someone scrolls Settings, opens a detail screen and goes back, Settings returns to the same position. The tester reports a jump to the top. Reproduce the failing route and navigation path before changing scroll handling; history back already intends to restore a per-route position.

## Acceptance

- [ ] Record the failing Settings detail route and whether return used the header, system Back or browser Back. A deep scroll returns to the same visible rows.
- [ ] Direct entry to Settings still starts at the top. A later visit through a new navigation does not reuse an unrelated old position.
- [ ] Verify web and Android back behavior, including a long Settings list and an interrupted navigation. No journal content appears over a gate.

Source: 11 October recording at 18:03.
