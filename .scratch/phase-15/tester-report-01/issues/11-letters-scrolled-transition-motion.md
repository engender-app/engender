# 11 - Repair Letters entry from scrolled Transition

Status: done
Size: M
Model: gpt-6.1-sol
Type: bug
Blocked by: 09
UI: yes

## What to build

Opening Time Capsule Letters from a scrolled Transition screen currently appears to jump between two screen positions. Keep a single, coherent handover into Letters and a stable return to Transition.

## Acceptance

- [ ] Reproduce the two jumps from a scrolled Transition screen and retain consecutive painted frames plus navigation timing.
- [x] Letters enters once, without old and new screens alternately claiming the viewport. Back returns to the prior Transition position.
- [x] Check web and Android, empty and populated Letters, rapid repeat navigation, reduced motion and gate replacement.

Source: 11 October recording at 18:27.

## Comments

Closed on 12 October 2026 as not reproduced on the tested builds. The first acceptance item remains unmet: the source recording contains audio only, and the reported pair of jumps was not reproduced. No product patch is justified by the retained evidence. This is an explicit closure exception, not a claim that all acceptance items passed.

The remaining navigation requirements passed: 46 web captures with 1,344 painted frames, and 38 accepted native captures with 1,119 painted frames. Empty and populated Letters, exact Back scroll restoration, rapid taps, interrupted navigation, reduced motion and native Home/PIN return were checked. Gate evidence distinguishes outgoing snapshots before native visibility becomes hidden from the PIN-only first returned frame.

Standards review found no violations. Spec review required a correction to distinguish 32 accepted scenes from an incomplete runner attempt; that correction was rechecked and resolved. The note is in `../verification/11-letters-native.md`. Raw evidence and failed attempts are archived under `.claude/phase-15-tester-report-01-delivery/archive/tester-parallel-11/.claude/` in the primary checkout.

The integration diff adds verification documentation only. Production source matches integration 529e854a, whose production build, warning-free typecheck, full Node suite, copy, licence, screen-class and startup-payload checks passed.
