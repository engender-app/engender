# 01 - Measure notice movement after appearance

Status: ready-for-agent
Size: M
Model: gpt-6-astra
Blocked by: None
Source: [Reliable CI with complete failure reporting](../../ci-reliability/spec.md)

**What to build:** The cold-load guard accepts a measurements notice that appears after 510 ms and stays stationary, while still failing missing content and the original movement defect. Deliver the corrected guard with controlled browser proof and a hosted result.

Extend the current guard on remote main. Keep sampling before appearance and assess movement from the first visible frame through settling, with the existing 3 px tolerance. Use bounded readiness and observation; do not merely widen the old document-relative cutoff. The retained CI frames are evidence to reproduce, not proof that every load condition is correct.

- [ ] A stationary notice appearing after the old cutoff passes in a controlled browser case.
- [ ] A missing notice, incomplete observation and failure to settle each fail with a specific explanation.
- [ ] Deliberately introduced movement greater than 3 px fails, including movement after the old cutoff.
- [ ] Fresh and remembered reserve states retain coverage; the complete cold-load guard runs after the focused proof.
- [ ] Existing independent-check reporting and retry behavior remain intact. Record the tested revision, hosted run and all attempt results.
- [ ] Merge this repair independently under current rules. Do not wait for runtime optimization or activate the new gate.
