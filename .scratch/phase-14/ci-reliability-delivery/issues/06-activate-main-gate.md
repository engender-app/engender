# 06 - Activate the main gate after repairs have merged

Status: ready-for-agent
Size: M
Model: gpt-6-astra
Blocked by: 01, 02, 03, 04
Source: [Reliable CI with complete failure reporting](../../ci-reliability/spec.md)

**What to build:** After pending work and CI repairs can merge under current rules, main requires an up-to-date PR with a successful `All required checks` result. Solo work needs no second reviewer, and no configured actor can bypass the gate.

This is the final rollout action, separate from every repair merge. Do not activate the gate on intermediate branches or make the preceding tickets depend on it. Confirm the passing main revision is still current; if it has advanced, inspect the complete result for the new tip before activation. The repeat-run timing report is not a blocker: a complete passing main run is required, but neither completion of the timing sample nor attainment of the 10-minute target is required for activation.

- [ ] Pending work and the preceding repairs have had the agreed opportunity to merge under current rules; no large integration PR is required by this rollout.
- [ ] Before activation, record a complete passing run on the current main revision. Do not replace this with a local pass or a partially successful workflow.
- [ ] Require PRs, up-to-date branches and the existing aggregate check. Require no second reviewer and configure no bypass actors.
- [ ] Preserve deletion and force-push protection. Missing, skipped, cancelled, failed or blocked required results cannot permit integration; a bounded recovered retry may permit success as specified.
- [ ] Verify actual merge eligibility for an up-to-date passing candidate and for stale, missing or unsuccessful required results. Do not rely on configuration text alone or merge a failing verification candidate.
- [ ] Update contributor instructions to match the enforced PR path when activation occurs. Preserve release workflow dependency on complete checks.
- [ ] Record the applied rules and verification evidence. Do not silently bypass or weaken the new policy to finish the ticket.
