# 25 - perf: The long-journal benchmark measures two sizes

Status: resolved
Type: build
Audit findings: P07
Severity: P3, after release (not in the release gate)
Blocked by: none
Size: S
Size note: under a day
Model: sonnet
UI: no. No `/impeccable` pass.

## Problem

`tests/long-journal/run.mjs` builds one journal: about 3,300 entries over ten
years. Every read passes its budget there (cold open 72 ms, Home 18 ms, the
whole decade of stats 7 ms; run 58 s; `.claude/audit-2026-10-03/perf/long-journal.log`),
but one size cannot show whether a read grows faster than the journal does. A
read that is quadratic but small today passes until a real journal outgrows it.

## What to build

- A second fixture, about one year, from the same generator.
- For each measured read, the ratio of its ten-year time to its one-year time,
  printed beside the budgets. Flag a read whose ratio is well above the size
  ratio (about 10); pick the threshold from the first run, with headroom for
  noise, and say how it was picked.
- The same on the Android tier if its runner shares the generator; otherwise
  note it as a follow-up in Comments.
- Keep the run under about two minutes on desktop.

## Acceptance

- [ ] The benchmark reports both sizes and the ratio per read.
- [ ] A deliberately quadratic read (in a scratch copy) trips the ratio check.
- [ ] Desktop run time stated.
