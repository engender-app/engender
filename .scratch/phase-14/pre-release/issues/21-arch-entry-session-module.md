# 21 - arch: The entry save lifecycle becomes a module with node tests

Status: ready-for-agent
Type: refactor
Audit findings: A4
Severity: P3, after release (not in the release gate)
Blocked by: 03, 10
Blocked by note: 03 (same component; land the editor fixes first), 10 (the leave guard it should use)
Size: M
Size note: one to two days
Model: opus
Model note: (the most common write in the app, and every recent bug here came from how the pieces are called)
UI: no. Nothing renders differently; the browser guard proves it. No
`/impeccable` pass.

## Problem

Logging an entry is the app's most common write, and its save lifecycle lives
in `EntryEditor.svelte`'s roughly 840-line script:

- six flags: `saving`, `pendingDraftOperations`, `mirrorRead`, `destroyed`,
  `saveRecovery`, `navigationFailed`;
- a module-level `detachedEntrySave` (`EntryEditor.svelte:1-16`) that outlives
  unmount across a privacy lock;
- the encrypted localStorage mirror (`entryDraftStore.ts`,
  `entryDraftPersistence.ts`, `entryDraft.ts`);
- navigation after the save (`:128-215`, `:788-849`).

The pure helpers exist, but the bugs come from how they are called. Three fixes
landed on 2 October, all inside the component and all proven only by the browser
guard `tests/entry-pending-save.mjs`: `55e3b0ce` (edits lost while attachment
storage was pending), `c088c966` (a pending save across a privacy lock),
`120fe912` (draft recovery owned by the wrong editor). The component has 52
commits since 1 September. Architecture report:
`.claude/audit-2026-10-03/report-architecture.md`, A4.

## What to build

- `entrySession.svelte.ts`:
  `entrySession({ entryId, epochDay, entries, draftStore, navigate })` returns
  `{ draft, saving, preparing, prepare(op), save(), leave(), resume() }`. It
  owns the flags, the detached recovery, the mirror ordering and the navigation
  port; it uses the leave guard from ticket 10.
- The component keeps media capture and layout.
- Node tests with an in-memory journal and a fake draft store, covering the
  three 2 October bugs as cases: a lock during save, resume on the same route,
  another editor's leftovers. Each test must fail against the pre-fix
  behaviour (reintroduce the bug in a scratch copy, watch it fail).
- `tests/entry-pending-save.mjs` shrinks to checking the wiring.
- ADR-0009's mirror pattern is kept.

## Acceptance

- [ ] The component holds no save-lifecycle flags; the module does.
- [ ] Node tests reproduce each of the three 2 October bugs when reverted.
- [ ] The browser guard and the walkthrough's entry flows pass unchanged.
