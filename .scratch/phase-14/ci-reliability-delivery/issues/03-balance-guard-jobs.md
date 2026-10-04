# 03 - Balance guard jobs by measured duration

Status: ready-for-agent
Size: L
Model: gpt-6-astra
Blocked by: None
Source: [Reliable CI with complete failure reporting](../../ci-reliability/spec.md)

**What to build:** Dev and built guards run in duration-balanced parallel jobs on the existing GitHub runners, with complete coverage and a hosted before-and-after timing report. A long group no longer receives the same allocation merely because it has the same number of guards as a shorter one.

Use existing per-attempt timings to measure guard, build and setup costs. Extend the existing roster, shard selection and workflow rather than introducing another runner. Reuse compatible builds only where measurement supports it, preserving revision identity, demo and production distinctions, and the signed-tag version contract. Coordinate edits to shared runner and workflow code with the retry-evidence change; overlapping files are not a semantic dependency.

- [ ] Group allocation follows measured duration and includes every existing guard. Coverage comparison detects omissions and unintended duplication.
- [ ] New groups run through the actual hosted workflow and contribute to the existing aggregate result.
- [ ] Concurrent jobs isolate browser storage, fixture state and mutable build outputs. Demo and production guards receive the correct artifacts.
- [ ] Build reuse is implemented where measured savings justify it, or its omission is explained by the measured cost. No paid runner upgrade or replacement framework is introduced.
- [ ] Hosted evidence records setup and build cost, group durations, elapsed time and summed runner minutes. Report any remaining bottleneck honestly.
- [ ] Failure collection, blocked results and bounded retry semantics survive the scheduling change; preserve retry-evidence work if it has already merged.
- [ ] Merge independently under current rules. Neither full-workflow 10-minute attainment nor gate activation is a prerequisite.
