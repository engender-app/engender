# 11 - Repair Letters entry from scrolled Transition

Status: ready-for-agent
Size: M
Model: gpt-6.1-sol
Type: bug
Blocked by: 09
UI: yes

## What to build

Opening Time Capsule Letters from a scrolled Transition screen currently appears to jump between two screen positions. Keep a single, coherent handover into Letters and a stable return to Transition.

## Acceptance

- [ ] Reproduce the two jumps from a scrolled Transition screen and retain consecutive painted frames plus navigation timing.
- [ ] Letters enters once, without old and new screens alternately claiming the viewport. Back returns to the prior Transition position.
- [ ] Check web and Android, empty and populated Letters, rapid repeat navigation, reduced motion and gate replacement.

Source: 11 October recording at 18:27.
