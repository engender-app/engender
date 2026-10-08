# 11 - Verify long-journal and first-load performance

Status: ready-for-agent
Type: task
Owner: Performance / Verification
Size: M
Size note: 2-4 engineer-days for current baselines, comparison, coverage gaps and small proven regressions. Wider regressions require re-estimation before expanding scope.
Model: sonnet
Model note: Existing fixture, runners and budgets bound the task; escalate a demonstrated architectural regression rather than undertaking an unplanned rewrite.
UI: no planned visual changes
Blocked by: 08, 09, 10

## Context

The repository already has a ten-year journal fixture, encrypted database and
attachments, query-plan assertions, first-load budgets and measurements for
saving, search, charts and Archive operations. The architecture review did not
measure a current performance defect. This ticket requests current evidence
on the resulting integration and targeted repairs only when a regression is
reproduced. A framework change is not a performance requirement.

Source anchors: [long-journal runner](../../../../tests/long-journal/run.mjs),
[existing budgets](../../../../tests/long-journal/budgets.json),
[first-load check](../../../../scripts/check-first-load-budget.mjs),
[query-plan proofs](../../../../src/lib/data/sqlite/query-plans.test.ts), and
[verification rules](../../../../docs/agents/verification.md).

## What to build

Run the existing first-load and long-journal measurements on the integration
containing 08-10. Record environment, revision, fixture and commands. Compare
against applicable existing budgets and, for a suspected regression, a
comparable baseline under the same conditions. Inspect whether new backup
execution has a meaningful unmeasured user cost; add a measurement only for
that missing behavior through the existing benchmark or native harness.

Diagnose repeatable failures before editing code. Fix the responsible query,
transfer or lifecycle owner and rerun affected correctness and performance
checks. If existing workloads pass and new behavior is already covered, an
evidence-only completion is correct.

## Acceptance

- [ ] Evidence identifies exact revision, runtime/hardware, build flags, fixture, commands and measurement outcomes; historical numbers are not presented as fresh results.
- [ ] Existing first-load and ten-year journal checks execute, including save, search, charts, startup and Archive workloads. Missing prerequisites and skipped measurements remain explicit.
- [ ] The new automatic-backup path is assessed for bounded memory/transfer behavior using the existing long-journal fixture and applicable native instrumentation. Add only genuinely missing measurements.
- [ ] Reproduced budget failures are compared with a comparable base and attributed before code changes. Actual main CI is checked before calling a failure pre-existing.
- [ ] Any optimization has a measured before/after and a correctness proof for affected journal or Archive behavior, including encryption and recovery where relevant.
- [ ] Budgets are not raised, fixtures shrunk, workloads removed or assertions weakened merely to make results pass. A legitimate rebaseline names the changed environment or accepted behavior.
- [ ] Desktop and emulator timings are not labelled real-phone rendering measurements. Hardware gaps have a concrete follow-up record.
- [ ] Final evidence summarizes remaining failures or confirms measured budgets pass. No speculative performance edits are made when evidence requires none.

## Testing Decisions

Use existing long-journal and first-load runners as the highest seam. Reuse
query-plan assertions and journal/driver contracts for focused regressions;
avoid tests that mirror a new optimization's implementation. Repeat a run
only to resolve timing noise, changed code or an unresolved comparison, not
to obtain a lucky pass. Follow repository failure-attribution rules.

## Dependencies and handoff

08-10 must land so the final measurement represents their storage, recovery
and compatibility behavior. Baseline inventory can happen sooner. Record
results in the existing evidence conventions and link them from this ticket;
no new benchmark dashboard or monitoring service is needed.

## Out of Scope

Framework rewrite, general cleanup, speculative indexing/caching, new cloud
telemetry, blanket microbenchmarks, unsupported claims about device speed,
or relaxing data-integrity guarantees to improve timing.
