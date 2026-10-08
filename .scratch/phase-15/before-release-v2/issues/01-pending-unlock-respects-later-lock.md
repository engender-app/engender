# 01 - Keep a later lock authoritative over pending unlock

Status: ready-for-agent
Type: bug
Severity: P1
Audit finding: 2026-10-08 expanded audit SEC-01
Owner: Backend
Size: M
Model: opus
UI: yes
Blocked by: None

## What to build

Leaving under Immediately must keep the journal locked even when an earlier
correct authentication is still completing. Returning must require a fresh
unlock. A stale successful attempt must neither reopen access to journal
data nor remove the lock gate.

## Problem and evidence

The unlock operation derives a key, reopens the journal and commits an opening
transition asynchronously. A later leave can lock the session before that
work finishes, but the old attempt still completes. Immediate leave does not
retain an absence timestamp, so returning does not repair the late unlock.

The audit delayed a genuine successful decrypt in a Chromium demo journal,
left during that delay and then released it. The journal became available
while hidden and remained unlocked on return. Visibility events were
simulated; this was not a physical-device test. The feature spec links the
probe and preserves that evidence limit.

Keep cancellation and session ownership coherent across shared unlock paths.
Preserve the existing drain/close/reopen ordering and the exceptions for the
app's own system prompts. Do not introduce a second access-mode model.

## Acceptance

- [ ] A deterministic behavioral regression reproduces the reported ordering
      before the fix using the real authentication/session composition.
- [ ] A successful authentication that began before a newer lock cannot
      reopen journal access or commit the unlocked transition afterward.
- [ ] Cover a leave during derivation, during database reopening and before
      the final opening transition commits. Returning remains locked, while a
      fresh valid attempt succeeds.
- [ ] Exercise the affected shared PIN, passphrase and biometric/device
      authentication paths without bypassing credential verification. Keep
      existing wrong-secret, throttling and reopen-failure behavior intact.
- [ ] Immediately, timed absence, Restart and the documented grace for the
      app's own system screens retain their intended behavior. No new lock
      loop is caused by an authentication prompt itself.
- [ ] The regression is part of the appropriate maintained test runner.
      Relevant session/lock checks and required final checks pass; report
      platform-specific runtime proof and any limits precisely.

## Comments

2026-10-08: One complete fix for the P1 lifecycle race. The feature spec holds
the audit evidence and orchestration instructions.
