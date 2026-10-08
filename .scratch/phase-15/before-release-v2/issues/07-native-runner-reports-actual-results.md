# 07 - Make native test results reflect actual execution

Status: ready-for-agent
Type: bug
Severity: P2
Audit finding: 2026-10-08 expanded audit TEST-01
Owner: Backend
Size: M
Model: sonnet
UI: no
Blocked by: None

## What to build

The Android test command must distinguish passed, failed and skipped tests,
fail incomplete instrumentation runs, and actually execute its claimed
process-death persistence check.

## Problem and evidence

The XML reporter calls any testcase without a failure/error element a pass,
including skipped tests. Its caller also discards the instrumentation
process's unsuccessful status once some passing XML exists.

The audit executed the production reporter with a skipped PIN-wait
process-death test and with partial passing XML from an aborted run. Both
produced PASS. The real process-death test requires a stage argument that the
standard runner never supplies, so that test is skipped during ordinary use.

Keep this a correction to the existing runner and its staged exercise. It
does not request a new CI platform or blanket changes to unrelated tests.

## Acceptance

- [ ] Regression fixtures prove that skipped testcases are never reported as
      PASS and that unsuccessful process exit, signal, startup failure and
      timeout cannot succeed because partial passing XML exists.
- [ ] Existing passed and failed testcases remain accurately attributed.
      Missing or unusable results fail clearly, without inheriting prior
      device/run results.
- [ ] The standard native test command executes the required PIN-wait
      persistence sequence: seed, actual app-process termination, restore in
      a new process, then cleanup. Required stage skips or failures fail the
      command; legitimate optional skips remain explicitly identified.
- [ ] Verify that the staged test genuinely crossed process termination and
      preserved the delay. Do not replace this with two calls in one process
      or silently reset its state between stages.
- [ ] A runner-level test exercises unsuccessful invocation plus partial XML,
      not only the report parser. The command's final exit status reflects
      the complete required run.
- [ ] Run the maintained parser/runner tests and required final checks, then
      demonstrate the staged exercise on an isolated Android test runtime.
      Preserve stage-specific logs and report skips and failures explicitly.

## Comments

2026-10-08: The feature spec links the exact reporter proof and output.
Other native tickets can run direct instrumentation checks independently;
this runner correction is not a semantic blocker for their implementation.
