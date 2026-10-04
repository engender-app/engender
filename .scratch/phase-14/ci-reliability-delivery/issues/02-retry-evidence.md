# 02 - Keep recovered failures visible in successful CI

Status: ready-for-agent
Size: M
Model: gpt-6-astra
Blocked by: None
Source: [Reliable CI with complete failure reporting](../../ci-reliability/spec.md)

**What to build:** A passing retry permits success but remains visible as a recovered failure in Actions. The summary identifies the failing case, revision and attempt timings, and both attempts remain available for seven days even when the workflow succeeds.

Extend the existing runner, summaries and artifact uploads. Preserve complete independent-check reporting; do not rebuild the registry or fail-collection mechanism already on remote main. Keep the existing one-retry limit. This slice includes the workflow upload condition, so it is useful without later scheduling work.

- [ ] First-attempt passes and failed-then-passed guards have distinct summary results.
- [ ] A recovered result permits success and includes the failing case, tested revision and timings for both attempts.
- [ ] Both attempt logs and diagnostics remain available for seven days on an overall successful run containing recovery. Later attempts do not overwrite earlier evidence.
- [ ] A guard failing both attempts keeps the result unsuccessful while later independent guards still run. Failed prerequisites produce explicit blocked results.
- [ ] Existing runner behavior tests and a controlled hosted recovery demonstrate output, exit status and artifact retention. The verification failure is synthetic and does not weaken product assertions.
- [ ] Merge this change independently under current rules, without activating the new gate.
