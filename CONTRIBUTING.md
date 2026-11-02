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

## Test conventions

The walkthrough (`tests/walkthrough.test.mjs`) finds every element by a
`data-*` attribute, an id or an ARIA role or state, never by a CSS class and
never by rendered copy, so a screen can be restyled and reworded without
touching it. Where a component already has an identity (a tag's id, a goal's
key, a toast's kind), the handle carries that identity rather than the label.
Copy is allowed in two cases, a localisation check and a value the test typed
itself, and each is marked with a trailing `// text-under-test` comment.
`tests/walkthrough-locators.test.ts` fails on a class selector or an unmarked
copy match, and `tests/walkthrough-handles-exist.test.ts` fails on a handle
no source file carries.

## Adding a module

A module is a tracked area with its own data and, usually, its own screen.
Propose one only if all of the following hold, and say how in the pull
request. It holds something no existing area can. It is read back where it
was written, or spent on another screen, in which case it is managed in
Settings and takes no hub row (ADR-0084). It registers an archive section in
`src/lib/data/journal/archiveSections.ts` that the golden fixture covers, so
it travels in a backup (ADR-0027). It works on both platforms, or hides only
the platform facility and never a record the person created (ADR-0063). Any
figure it ships from outside, such as a helpline, a statute or a paper, has a
source and a reviewed-on date registered in `src/lib/reviewedContent.ts`
(ADR-0102). It adds no Today tile and no notification without retiring one.

Plan for its removal as well. Cutting a module removes it rather than hiding
it: a migration drops its tables, and its section name joins
`DROPPED_ARCHIVE_SECTION_NAMES` so an older archive that carries it still
restores.

## Writing an ADR

Write an ADR only when at least one of these holds: reversing the decision
needs a migration, an archive-format step, a manifest or platform change, or
breaks existing data, backups or launcher shortcuts; it is a cross-cutting
rule many modules must follow and a newcomer would plausibly break; or it
rejects an alternative that will be proposed again. Everything else goes
where it is read: visual and motion rules in `DIRECTION.md`, screen behaviour
in `SCREENS.md`, terms in `CONTEXT.md`, product principles in `PRODUCT.md`, a
local rule in a header comment at the code it governs, and contributor
workflow here.

A record starts as `docs/adr/draft-<slug>.md`, cited as `ADR draft-<slug>`,
and gets its number when it lands on the docs repo's `main`. Numbers are
permanent and never reused. A record that is merged into another, moved to
one of the places above, or retired loses its file and leaves one tombstone
line in `docs/adr/README.md` saying where it went.

Under the title come four lines: `Status`, `Decided`, `Last reviewed`, and
`Supersedes` or `Amends`. An amendment rewrites the body to the current truth
and adds to the one `History:` line at the end, rather than stacking a
section. The decision itself is 150 words or fewer, the record about 600 and
1,000 at most. Name things instead of quoting values that rot: no hex
colours, frame counts, or counts of areas, tables, sections or palettes.
`tests/adr-citations.test.ts` holds the citations, the header, the size and
the tombstones; `tests/direction-citations.test.ts` holds every
DIRECTION.md rule, decision and tier the code cites.
