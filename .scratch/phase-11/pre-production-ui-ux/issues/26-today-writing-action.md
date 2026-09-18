# 26 - Keep Today writing discoverable on busy days

Status: done
Type: task
Size: S
Priority: P3
Scope class: Optional refinement
Blocked by: None - can start immediately
Model options: Claude Opus; GPT-6 Astra (high)
Model rationale: Compare alternative Today compositions before selecting or retaining a layout.
Audit evidence: [First audit U5](../../pre-production-audit/index.html#U5), [Screen 0](../../pre-production-audit/ui-ux-audit/index.html#screen-00)

## What to build

A busy Today view keeps its writing action discoverable while retaining running timers and chosen pins.

## Behavior and ownership

Compare a compact timer/agenda treatment or existing pin-editor placement against the baseline. Implement the smallest layout that improves finding the writing action; do not introduce another compulsory prompt. If neither option improves the task, record a retain decision rather than a cosmetic change.

## Acceptance

- [x] Empty, busy agenda, running timer and return-after-gap views preserve every listed capability.
- [x] At 390×844, a task comparison records where writing can be started and whether the main action is easier to find.
- [x] Running timer remains visible; pins are neither reordered centrally nor removed.
- [x] The comparison and chosen layout/retain decision are saved with the ticket.

## Verification

Before/after screenshots and a short start-entry task comparison. No new data model or behavior test for spacing-only changes.

## Constraints

Follow the [feature spec](../spec.md) and its shared acceptance contract. Read the linked route card, screenshot and reviewed Mobbin borrow/avoid notes before touching that surface. Apply Impeccable craft-floor checks without replacing the app’s visual identity. Do not copy rejected reference patterns.

Screen evidence: [/](../../pre-production-audit/ui-ux-audit/index.html#screen-00).

This is a bounded refinement, not a reproduced release blocker. Compare the proposed change with the current task first. A retain/defer disposition requires evidence and an explicit note; do not silently expand scope to force a redesign.

Use a fresh ticket branch, focused checks, Standards and Spec review, and a separate merge. Do not run the full yank sweep during this ticket; C139 and C99 own the final motion/polish round.

## Decision

Retain the current layout. The compact agenda trial did not bring the writing controls into view with a running timer. The existing fixed Quick add opens today's entry in two taps without scrolling. See [comparison and verification](../evidence/u26/decision.md) for measurements, screenshots, and limitations.
