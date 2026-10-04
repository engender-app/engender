# 05 - Verify complete CI on the merged revision

Status: ready-for-agent
Size: M
Model: gpt-6-astra
Blocked by: 01, 02, 03, 04
Source: [Reliable CI with complete failure reporting](../../ci-reliability/spec.md)

**What to build:** A reviewable verification record shows what the merged changes prove: complete coverage, a passing main run, visible recovered retries, and hosted feedback time with its runner-minute cost. This is a verification slice after the preceding changes have merged separately, not an integration branch or bundled PR.

Use three consecutive complete hosted runs of the same candidate revision. Record queue time separately while including it in trigger-to-required-result time. Keep first-attempt failures visible. A result above 10 minutes must remain a reported miss, but the optimization target must not become a new barrier to repair merges or activation of the correctness gate.

- [ ] All preceding slices have merged independently, and the coverage inventory still includes every required obligation.
- [ ] A complete run on main passes; record its exact revision and run link. A skipped, blocked, cancelled or unsuccessful required result cannot satisfy this criterion.
- [ ] Three complete hosted runs of the same candidate record trigger-to-result time, queue time, job durations, summed job minutes and recovered retries. Record all outcomes without replacing failed runs with an unreported rerun.
- [ ] Compare every sampled run with the 10-minute target. If it is missed, identify the measured bottleneck and remaining tradeoff without declaring the target achieved or reducing coverage.
- [ ] Verify recovered failures retain both attempts and diagnostics, and unsuccessful independent checks are all reported.
- [ ] Confirm release publication still depends on complete checks; do not publish a release to test this.
- [ ] Keep gate activation separate. This ticket can finish with a documented runtime miss once complete correctness verification and the measurement record are available; it cannot finish without a passing main run.
