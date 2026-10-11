# 09 - Measure creation and return flows in the yank sweep

Status: ready-for-agent
Size: L
Model: gpt-6.1-sol
Type: verification
Blocked by: None
UI: yes, motion measurement

## What to build

Extend the motion sweep beyond opening screens. It should capture what happens when someone creates an item from an empty journal, scrolls a populated screen and returns or backs out. Include Hair removal and Time Capsule Letters, the two routes where testers saw jumps. This ticket produces reliable evidence for their repair tickets.

## Acceptance

- [ ] Named scenes perform the intended add, scroll and return actions on empty and populated journals. A missing control or wrong route fails the run.
- [ ] Web and physical Android runs retain consecutive painted frames with timing and DOM or view-transition traces. Reports distinguish measured, excluded and failed scenes.
- [ ] Detector proof still catches an injected jump. Keep before captures for issues 10 and 11; classify other findings without treating every detector candidate as a product defect.

Sources: 11 October recordings at 18:24 and 18:27.
