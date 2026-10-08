# 06 - Clear existing widget labels under disguise

Status: ready-for-agent
Type: bug
Severity: P2
Audit finding: 2026-10-08 expanded audit A11Y-01
Owner: Backend
Size: S
Model: sonnet
UI: yes
Blocked by: None

## What to build

Enabling disguise must clear revealing accessibility descriptions from widgets
already placed on the launcher. Their spoken state must become neutral along
with their visible state, and disabling disguise must restore their labels.

## Problem and evidence

The shared widget provider omits the description update when its new label
is null. Android can reapply an update to the existing view hierarchy, where
an omitted update preserves the old description. A tally widget can therefore
retain "Misgendered" and "Correctly gendered" after its header is hidden.

The audit traced the application update path and Android's framework
reapplication behavior. It did not reproduce the transition on a physical
launcher. Current render tests create a fresh disguised view, which never
contains the previous description.

## Acceptance

- [ ] A native rendering regression first applies undisguised views, then
      reapplies disguised views to that same hierarchy. Demonstrate the
      retained descriptions before the fix.
- [ ] Every affected widget clears its previous revealing descriptions on
      disguise activation, including already placed widgets. Preserve the
      existing neutral glyphs and hidden-header policy.
- [ ] Toggling disguise off restores the correct localized descriptions;
      repeated toggles do not leave stale labels or break widget actions.
- [ ] Fresh widget creation, visible appearance, touch targets and launch
      routes retain their existing behavior.
- [ ] Verify the updated accessibility properties on an isolated native
      runtime. Keep this distinct from human TalkBack listening and the
      existing signed-candidate sign-off.
- [ ] Add the transition regression to the maintained native suite and pass
      relevant widget/disguise tests and required final checks. Record the
      evidence and any remaining platform-specific limitations.

## Comments

2026-10-08: The feature spec links the framework trace. This ticket owns
clearing existing accessibility state, not a visual widget redesign.
