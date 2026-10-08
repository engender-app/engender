# 02 - Restore journal access after browser Back

Status: ready-for-agent
Type: bug
Severity: P2
Audit finding: 2026-10-08 expanded audit DATA-01
Owner: Backend
Size: M
Model: opus
UI: no
Blocked by: None

## What to build

Returning through browser Back or Forward must restore a usable journal when
the browser reuses the previous document. The app must not expose a ready
session whose database was closed while leaving.

## Problem and evidence

Leaving a document releases the database worker's connection to avoid a race
over OPFS access handles on ordinary reload. The same release happens when
the browser keeps the document in its back/forward cache. Restoring that
document reuses ready session objects around the closed connection.

The audit captured a real persisted hide and show in Chromium. Calendar then
reported that it could not read the journal, and Try again failed again.
Reloading recovered access. No data loss was demonstrated.

Keep ownership of recovery at the browser/session lifecycle boundary. Do not
remove the existing access-handle release without preserving ordinary reload
behavior, or make one screen responsible for recovering every journal call.

## Acceptance

- [ ] Preserve a regression that performs actual document navigation and
      history restoration with BFCache enabled. Require a real persisted
      restoration rather than treating a synthetic event as sufficient proof.
- [ ] After restoration, journal reads and a saved change succeed and survive
      another normal reload. Calendar does not enter the observed persistent
      read-error state.
- [ ] Restoration respects the current lock policy and cannot expose a ready
      journal before required authentication/session recovery completes.
- [ ] Repeated Back/Forward cycles and ordinary reloads release or reacquire
      access handles correctly, without introducing a competing-connection
      error or retaining an obsolete worker.
- [ ] The browser regression explicitly enables BFCache despite the testing
      browser's default disabling argument, and fails if the intended cache
      restoration was not exercised.
- [ ] Register the regression in the maintained browser coverage. Relevant
      driver/session checks and required final checks pass; record evidence
      without claiming data-loss reproduction.

## Comments

2026-10-08: The feature spec links the real-browser probe, failed retry and
successful reload control. No semantic dependency on the pending-unlock fix;
the orchestrator must serialize any shared session work.
