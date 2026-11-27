# Contributing

Keep independent changes in separate branches and PRs. Review each change
against the repository standards and its specification, and fix the findings
before integration. Use a merge commit to preserve each change's history.

## Integrating a change

Open a PR targeting `main`. Update its branch from current main and wait for
the complete `Checks` workflow, including `All required checks`, to succeed
on the updated candidate. If main advances, update the branch and rerun CI.
A previous green revision does not establish that the new candidate passes.

Merge the eligible PR with a merge commit. The
[main ruleset](https://github.com/engender-app/engender/rules/24454303)
requires no approval from a second reviewer and has no bypass actors. Missing,
cancelled, failed or blocked checks do not permit integration. The aggregate
runs even when an upstream tier fails or is skipped, and accepts only
successful required tiers. A guard's single recovered retry may pass when
the summary identifies the recovery and retains both attempts for seven days.

Delete the branch after its PR merges. The main branch remains protected
against deletion and force pushes.

Release publication depends on the same checks:
`.github/workflows/release.yml` calls the complete CI workflow against the
commit the tag names, and its `build` job has `needs: checks`. The workflow starts only from a manual dispatch on main
(`gh workflow run release.yml --ref main -f tag=v1.2.3`); the tag must be
signed by a key listed in `.github/release-signers`.

Create that tag with the tag script, not by hand. Before tagging, run
`npm run test:android` on the clean candidate and commit the record it writes
to `scripts/progressive-release-record.json`, and add the version's section to
[CHANGELOG.md](CHANGELOG.md). The script refuses a dirty main, Android evidence
that doesn't match the candidate, or a version with no notes:

```sh
npm run release:tag -- 1.2.3 --dry-run
npm run release:tag -- 1.2.3
```

[Candidate evidence before publication](deploy/README.md#candidate-evidence-before-publication)
explains what the record must hold for each kind of release.

## Test conventions

See [Running tests](tests/README.md) for the suites and commands.

The walkthrough (`tests/walkthrough.test.mjs`) finds every element by a
`data-*` attribute, an id or an ARIA role or state, never by a CSS class and
never by rendered copy, so a screen can be restyled and reworded without
touching it. Where a component already has an identity (a tag's id, a goal's
key, a toast's kind), the handle carries that identity rather than the label.
Copy is allowed in two cases, a localisation check and a value the test typed
itself, and each is marked with a trailing `// text-under-test` comment.
`tests/node/tooling/walkthrough-locators.test.ts` fails on a class selector or an unmarked
copy match, and `tests/node/tooling/walkthrough-handles-exist.test.ts` fails on a handle
no source file carries.

Read source text in a test only for an invariant a rendered check cannot
observe. Name the invariant in the test. Use browser checks for rendered
behavior.

## Source comments

Explain the behavior a maintainer needs to preserve and why it matters.
Refer to decisions by ADR number and evidence by a public source. Leave
private tickets, sessions, audit labels and working documents out of comments.
`npm run check:comments` checks tracked source and test comments against a
baseline. After removing old references, run
`npm run check:comments -- --update` to record the lower counts.

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

Write an ADR if reversing the decision needs a migration, changes an archive
format, changes the platform or manifest, or breaks existing data, backups
or launcher shortcuts. A rule that spans several modules or a decision
that rejects a likely recurring proposal can also earn an ADR. Put local
rules in a header comment where the code implements them. Put change-specific
reasoning in the pull request description.

A record starts as `docs/adr/draft-<slug>.md` in the pull request that adds
it, cited as `ADR draft-<slug>`, and gets its number when that pull request
merges. Numbers are permanent. If you merge, move or retire a record, replace
its file with a tombstone in `docs/adr/README.md` saying where it went.

Under the title come four lines: `Status`, `Decided`, `Last reviewed`, and
`Supersedes` or `Amends`. An amendment rewrites the body to the current truth
and adds to the one `History:` line at the end, rather than stacking a
section. The decision itself is 150 words or fewer, the record about 600 and
1,000 at most. Name things instead of quoting values that rot: no hex
colours, frame counts, or counts of areas, tables, sections or palettes.
`tests/node/tooling/adr-citations.test.ts` checks citations, headers, the 1,000-word ceiling
and tombstones. It also checks that readers can follow public references in
a clone. Count the decision paragraph when you review the record.
