# 04 - arch: Guard runner that reports every failure, and a green main

Status: ready-for-agent
Type: build
Audit findings: A2, R1, P01; absorbs phase-12 final-audit ticket 35 (marked folded on 3 October)
Severity: P1, blocks release
Blocked by: none
Size: M
Size note: one to two days
Model: opus
Model note: (CI flake diagnosis across three tiers, and the release gate rests on it)
UI: no. No `/impeccable` pass.

## Problem

Main has not had a green run since 17 August (`5548d7a6`); of the last 40 runs,
36 failed and 4 were cancelled. `release.yml` reruns all of `ci.yml`, so no tag
can publish. Main is also 4 commits ahead of origin, so the audited commit has
never run in CI.

Guards run as one `node a && node b && ...` string per tier
(`package.json:15-16`). The first failure stops the rest: in run
`37056608582` the built suite failed at guard 21 of 35, so 14 never ran, and
the dev suite stopped at its first timeout. Nobody can see how red main is.

The guard list lives in three hand-kept places (`package.json`,
`tests/PROBES.md`, `.github/workflows/ci.yml:215-275`) with nothing checking
they agree:

- five guards run in CI with no PROBES.md line (`document-import-check`,
  `lab-entry-check`, `measurements-entry-check`, `regimen-editor-check`,
  `dose-editor-copy-check`);
- `wear-tile-close-yank` is indexed as a built guard but was never in
  `package.json`;
- `leave-lock-check.mjs` (privacy lock, `82667cec`) is neither indexed nor run;
- 38 of 128 `tests/*.mjs` have no PROBES.md line.

Failures in the latest run, all passing 3 of 3 locally
(`.claude/audit-2026-10-03/release/*-run{1..3}.log`):

- `tests/regimen-editor-check.mjs:281`: `navigate()` at line 14 clicks a link
  and waits two frames, never for the URL.
- `tests/prep-context-check.mjs:59`: `waitForURL('**/more')` after Fill every
  feature, 30 s.
- `tests/hosting/run.mjs:268`: one of two 60 s `[data-next]` waits; which one
  is not logged.

Earlier runs fail somewhere different each time: `letters-ready-jump:143`,
`tryout-save-check:65`, two walkthrough flows, and `empty-reflection:76`, a
strict-mode locator matching two "Things that help" links (a test bug).

## What to build

1. `tests/guards.json` (or a table PROBES.md is generated from):
   `{ name, tier: dev|built, holds }` per guard.
2. `tests/run-guards.mjs --tier dev|built`: builds once per tier as today,
   runs every guard, retries a failed guard once, prints a pass/fail table
   with durations, exits non-zero if any failed after retry. `package.json`
   and `ci.yml` call it.
3. A node test that `guards.json`, PROBES.md and the files on disk agree.
   Index or delete the unindexed probes it flags (the audit's A5 list names
   five with no caller).
4. Wire in `leave-lock-check` and `wear-tile-close-yank`; fix them first if
   they fail.
5. Fix `navigate()` to wait for the URL, the empty-reflection locator, and make
   the hosting test log which wait timed out. Diagnose the prep-context and
   hosting waits on a CI run, not only locally.
6. Push main. Get one fully green run on the current tip, and record its run id
   here. If the built job still approaches its 45-minute limit, split it into
   two parallel jobs.

Sharing one dev server or preview per tier is step two and can wait until
after release.

## Acceptance

- [ ] One guard list; the roster test fails when a guard file, PROBES.md or
      the list disagree.
- [ ] A CI run reports every failing guard, not only the first.
- [ ] `leave-lock-check` and `wear-tile-close-yank` run in CI.
- [ ] The three known flakes are fixed at their cause, not by longer timeouts.
- [ ] Main is pushed and a full CI run on its tip is green; run id recorded in
      Comments.

## Comments

**3 October 2026, worktree cleanup.** The stale `ci-green` worktree held CI
flake work that never merged: branch `ci-green` (kept) has one commit not on
main, `d9f2c1c6` "Test document import concealment through leave locking", and
the worktree had an uncommitted change to `tests/tryout-save-check.mjs` plus an
untracked `tests/.ci-tryout-feedback-red.mjs`. Both are saved in
`../ci-green-leftovers/` (`uncommitted-tryout-save-check.patch`, the red probe,
`unmerged-commit.txt`). Read them before fixing the tryout-save-check flake.
