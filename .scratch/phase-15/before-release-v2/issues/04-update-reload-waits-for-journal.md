# 04 - Keep update reloads outside journal writes

Status: ready-for-agent
Type: bug
Severity: P2
Audit finding: 2026-10-08 expanded audit REL-02
Owner: Backend
Size: M
Model: opus
UI: no
Blocked by: None

## What to build

Applying an app update must not reload over a journal operation that begins
while service-worker activation is pending. The handover must preserve the
operation's normal success or failure behavior.

## Problem and evidence

The update handler checks for a busy journal only before requesting worker
activation. It then waits for control to change or a timeout while the rest
of the app remains usable. A later write can still be running when the
handler unconditionally reloads.

The audit ran the production update and busy-counter modules in order: begin
an update while idle, begin a journal operation, signal takeover. The reload
callback observed a busy journal. This proves the ordering defect; it does
not establish its frequency or demonstrate database corruption.

Coordinate the complete handover through the existing write/lifecycle owner.
An initial idle check or a check in one save button is insufficient.

## Acceptance

- [ ] Preserve a deterministic failing regression in which a write starts
      after the update request and before activation completes.
- [ ] Neither controller takeover nor the activation timeout reloads over an
      operation still protected by the journal busy contract.
- [ ] A write that succeeds during the handover remains saved after reload.
      A failed operation follows its existing failure behavior without a
      reload silently discarding the user's recovery opportunity.
- [ ] Updates still apply once it is safe. A refused or failed activation
      cannot leave the update mechanism or journal permanently blocked.
- [ ] Cover both controller-change and timeout orderings, including a write
      that was already running before the update request. Verify actual
      public journal work in addition to the busy-counter unit contract.
- [ ] Register the behavioral regression, retain the existing user-initiated
      update policy, and pass relevant update/write tests and required final
      checks. Record any untested worker/platform behavior.

## Comments

2026-10-08: The feature spec links the ordering proof. This ticket owns safe
handover, not schema-refusal registration or a redesign of the update notice.
