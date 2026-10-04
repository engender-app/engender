# Contributing

Keep independent changes in separate branches and PRs. Review each change
against the repository standards and its specification, and fix the findings
before integration. Use a merge commit to preserve each change's history.

## Before gate activation

Pending work and CI repairs may merge under the existing rules through the
maintainer's authorized integration path. Keep failures visible in the
handoff. A local pass or a partly passing workflow is not a green main run.
Do not make repair merges depend on gate activation or combine independent
repairs into a large integration PR.

The live [main ruleset](https://github.com/engender-app/engender/rules/24454303)
determines whether the gate has activated. Read the effective rules with
`gh api repos/engender-app/engender/rules/branches/main`. Deletion and
force-push protection alone do not mean the PR/check gate is active.

## Once the gate is active

Open a PR targeting `main`. Update its branch from current main and wait for
the complete `Checks` workflow, including `All required checks`, to succeed
on the updated candidate. If main advances, update the branch and rerun CI.
A previous green revision does not establish that the new candidate passes.

Merge the eligible PR with a merge commit. The gate requires no approval
from a second reviewer and has no configured bypass actors. Missing,
cancelled, failed or blocked checks do not permit integration. The aggregate
runs even when an upstream tier fails or is skipped, and accepts only
successful required tiers. A guard's single recovered retry may pass when
the summary identifies the recovery and retains both attempts for seven days.

Delete the branch after its PR merges. The main branch remains protected
against deletion and force pushes.

## Activating the gate

Activate the gate as a separate final operation after the repairs have
landed and a complete hosted `Checks` run passes on current main. Record the
SHA and run URL, then recheck the main tip immediately before changing the
rules. If it advanced, obtain a complete passing run for the new tip.
Neither the three-run timing sample nor the 10-minute target is a prerequisite.

Preserve deletion and force-push protection. Require a PR, an up-to-date branch
and `All required checks` from GitHub Actions, with zero required approvals
and no bypass actors. Record the applied rules and actual merge eligibility
for an up-to-date passing candidate and stale, missing or unsuccessful
candidates. Verify that skipped upstream tiers make the aggregate fail. GitHub accepts
skipped check conclusions, so a skipped aggregate must not be mistaken for
verified coverage. Investigate any reachable path that permits it to merge.
Never merge a failing verification candidate or weaken the policy to complete
the rollout. Leave unmet verification criteria open.

Publish the contributor instructions before the final passing main run so
activation does not require another source change. Release publication keeps
its existing dependency: `.github/workflows/release.yml` calls the complete
CI workflow and its `publish` job has `needs: checks`.
