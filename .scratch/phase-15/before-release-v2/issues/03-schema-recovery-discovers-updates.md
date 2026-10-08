# 03 - Make schema recovery discover available updates

Status: ready-for-agent
Type: bug
Severity: P2
Audit finding: 2026-10-08 expanded audit REL-01
Owner: Backend
Size: S
Model: sonnet
UI: no
Blocked by: None

## What to build

When an older web app refuses a newer journal schema, its explicit update
action must check for and apply an available compatible app release without
requiring the journal to open first.

## Problem and evidence

Normal service-worker registration waits for a successful boot or first-run
setup. The schema-refusal state reaches neither. Its recovery action reads
an uninitialized update registration and reports nothing newer without making
a check, even when a worker is already waiting.

The audit composed the real registration and update modules from cold state
with an available waiting worker. Recovery returned false with zero
registration and update calls. Existing tests preinstall the registration or
test the boot gate separately.

## Acceptance

- [ ] A cold-state regression reaches schema refusal without first registering
      through ready/setup and demonstrates the missed update before the fix.
- [ ] The explicit recovery action acquires the appropriate registration,
      finds a waiting compatible release and can hand over to it while the
      journal remains unopened by the incompatible code.
- [ ] A release that starts installing during the check is awaited within the
      existing bounded behavior; failure and unavailable/offline outcomes
      leave the recovery action usable and report the appropriate outcome.
- [ ] Normal boot still defers background precaching as intended and installs
      only one update watcher. Preserve Android's local-bundle update policy.
- [ ] Maintain a regression over the cold boot-to-recovery composition rather
      than only isolated helper mocks. Relevant update/registration checks and
      required final checks pass.

## Comments

2026-10-08: The feature spec links the failing composition proof. Shared
update code with ticket 04 requires scheduling coordination, not a blocker.
