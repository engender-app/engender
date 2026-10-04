# 17 - ux: Care and health screens say what they mean

Status: ready-for-agent
Type: bug
Audit findings: V03, V07, V10, V11 (V09 moved to 31; V10 hit areas to 29)
Severity: P2 (V03, V07), P3 (rest)
Blocked by: 02
Blocked by note: (same dose log screen; land the sheet fix first)
Size: M
Size note: one to two days
Model: sonnet
UI: yes. Mandatory `/impeccable` pass on each changed screen, then sign-off
and the no-yank clause from the spec.

Evidence for all: `.claude/audit-2026-10-03/ux2/` (`shots/seg/`, `shots/sg/`),
`report-ux2.md`.

## Problems and fixes

- **V03, "Archived" under Ongoing.** `health/surgery/+page.svelte:60-64`
  groups by the user flag `procedure.archived`, while
  `ProcedureRecoveryCard.svelte:82,94` labels the automatic phase after 90 days
  `surgery_phase_archived` ("Archived"). So "top surgery · Archived · Day 400"
  sits under "Ongoing procedures". Rename the phase ("Healed" or "Past
  recovery"; ask Alicja) or group by phase.
- **V07, the dose log is 15,163 px of flat rows.** About 200 rows, no day
  grouping, each ending "under Sertraline" right after "Sertraline 50 mg ·
  Oral", which forces titles onto two lines (`doses_under_episode` in
  `care/doses/+page.svelte`). Drop the episode label when it repeats the drug,
  group by day, batch older rows behind a "show more" the way the tryout list
  does.
- **V10, Changes you've noticed.** The legend swatch for "Not tied to a
  direction" is a white dot on near-white while the chart draws hollow grey
  rings; "Shaded bands describe the literature" shows with no bands; 16 point
  buttons are 22x18 (`care/changes/+page.svelte:396`, `effectDirections.ts:23`).
  Match the swatch to the mark and show the sentence only with bands. (The
  22x18 hit areas are ticket 29, A04.)
- **V11, two uncaptioned charts.** `care/+page.svelte:826-870`: the 7-day
  injection cycle and the 28-day fold are stacked with no titles, and the
  second's "5.0" touches the first's "Day 1 / Day 7". Caption both; separate
  them.

## Acceptance

- [ ] No procedure under Ongoing reads Archived.
- [ ] Dose log grouped by day, titles on one line at 390 px, older rows
      batched.
- [ ] Changes chart legend matches its marks; no sentence about absent bands.
- [ ] Both Care charts captioned and clear of each other.
- [ ] `/impeccable` pass done; sign-off crops per change, trans light and dark.
- [ ] Batched rows revealing, and any regrouping, sampled per frame: no yank.

## Comments

### Work paused on 4 October 2026

User requested a stop and a merge of completed work only. Ticket 17 is not
complete and must stay outside that merge batch. No further implementation
work is authorized until the user resumes it.

Implementation is committed at `ede110b11719540a66e619b287586c608f0254a6`
on `orchestrate-agent/1409e8f872d6/17`, based on
`7932f0d9319c068d9bbda94e5de6ccbb685a3777`. Worktree:
`/home/alice/_projekty/priv/gender-diary/.claude/worktrees/o-1409e8f872d6`.
The tracked source tree was clean when work stopped. No source fix for the
remaining motion defect was started or left uncommitted. This comment is a
documentation-only change. Captures, logs, helper scripts and detached
baseline/production worktrees remain under the ignored `.claude/review-17/`.
All owned browser, build and queued jobs have stopped; no preview remains.

### What is implemented

Procedures whose existing automatic phase reads Archived are grouped with
manually archived procedures, without changing stored archive flags or
claiming recovery. Procedure record nodes retain their identities through
regrouping. Stable heading slots follow ADR-0078's direct text-change rule.

The dose log has local-day headings, shorter titles and explicit batches of
30. Shared `BatchedList` owns restoration, deep-link expansion and growth;
manual mode collapses the final control and its spacing together. Repeated
same-drug attribution is removed. The Changes legend uses neutral hollow
rings for side effects, and literature context appears only with expanded
bands. Both Care interval charts have translated captions and separation.

### Verification and blocker

The exact implementation pin passed demo and production builds, typecheck
with zero errors or warnings, copy, licence and screen-class gates, and all
504 Node test files / 6686 tests. Production first-load payload passed at
104 files and 251415 bytes gzip, against 105 files / 253722 bytes. Results:
`.claude/review-17/verification-final.json` and the `*-confirm.log` files.

Independent Standards and Spec source reviews closed their findings at the
implementation pin. Reports are `standards-final.md` and `spec-final.md` in
`.claude/review-17/`. Reviewer task IDs:
`01a107dc-9c62-7383-8ce8-f38041ed42cd` and
`01a107dc-9c62-78c3-a8d2-98222e618466`.
Those source verdicts do not establish runtime sign-off.

Final gated capture produced 20 paired component crops and 527 motion frames:
166 baseline frames and 361 after frames, eight scenes per side. Exact after
source/build provenance is in `.claude/review-17/after/report.json`.
Baseline is `.claude/review-17/before/report.json` at `7932f0d`.
After checks pass 44 of 46. Both failures are dose date regrouping, in trans
light and dark: saving a dose from 4 October to 2 October produces jumps of
about 46.5px as day headings transfer between rows. Record identity remains
stable. Some rows move 46.5px on the first changed frame, then travel back.
The failures are `dose-regroup-light: regroup travels through intermediate
positions` and the corresponding dark check. This violates the no-yank
acceptance clause and blocks completion.

Surgery regrouping, batch reveal, final-control spacing, deep-link retention,
390px titles, 200% text fit, legend, bands context, chart captions and absence
of uncaught page errors pass. Failed reports and frames remain unchanged in
`before/` and `after/`; earlier evidence remains under `before-initial/`,
`after-initial/`, `before-7c26202b/` and `after-7c26202b/`.
`index-7c26202b.html` is historical, not final sign-off. No final review index
or completed rendered confirmation was delivered. The Impeccable audit and
polish draft is `.claude/review-17/impeccable.md`.

Earlier light-browser resource peaks undercounted detached Chromium because
the helper summed one process session. Those peaks cannot prove compliance
with the 1 GiB ceiling. Final confirmation ran under the ordinary shared
heavy gate. See `.claude/review-17/resource-audit.md`; light work stays paused
until full-descendant counting and cleanup are independently validated.

### Remaining work and resume

Inspect the failing per-frame dose rows, their day headings, FLIP transforms
and disclosure/resize heights. Fix the 46.5px jumps, then rerun only the
justified confirmation checks. Preserve the failed evidence first. Complete
the rendered Impeccable confirmation and paired review page, obtain updated
independent review of any source fixes, and hand the clean pin to the parent
for user sign-off and integration. No physical-device performance proof was
performed or claimed.

Resume from the worktree above. The evidence runner is
`tests/care-health-gallery.mjs`; the shared gate is
`/home/alice/_projekty/priv/gender-diary/.claude/orchestration/phase14-no-ui-20261003/heavy.py`.
After a new source commit, align the detached production worktree to that
commit before using `.claude/review-17/verify-final.py`. Useful commands:

```sh
python /home/alice/_projekty/priv/gender-diary/.claude/orchestration/phase14-no-ui-20261003/heavy.py -- python .claude/review-17/verify-final.py
python /home/alice/_projekty/priv/gender-diary/.claude/orchestration/phase14-no-ui-20261003/heavy.py -- node tests/care-health-gallery.mjs after .claude/review-17
python .claude/review-17/make-gallery.py
```

The second command writes `after/`; move the preserved failed directory
aside before running it. Baseline runner command:
`node tests/care-health-gallery.mjs before .claude/review-17 .claude/review-17/baseline-source`.
Use it under the shared gate. The owned interactive preview command is
`.claude/review-17/preview.sh` on port 8917; it is currently stopped.

