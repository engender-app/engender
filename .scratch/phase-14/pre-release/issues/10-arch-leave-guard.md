# 10 - arch: One leave guard for every draft

Status: ready-for-agent
Type: bug
Audit findings: A1, V02, V16
Severity: P2
Blocked by: none
Size: S
Size note: under a day (the module and the detailDraft default); moving the
other copies is optional in scope
Model: sonnet
UI: yes (the discard sheet appears on two screens that had none). Mandatory
`/impeccable` pass on the discard sheet on those screens, then sign-off and the
no-yank clause from the spec.

## Problem

The interaction-language spec
(`.scratch/done/phase-12/interaction-language/spec.md:34-38`) says leaving changed
work requires a deliberate discard. No module owns that. Four screens copy the
same `beforeNavigate` sequence (cancel, keep a pending departure, replay with
`history.go(delta)` or `goto`):

- `src/lib/components/kit/RecordSheet.svelte:96-127,187-198`
- `src/routes/care/regimen/+page.svelte:196-209,890-896`
- `src/routes/transition/tryouts/[id]/+page.svelte:106-121,610-616`
- `src/routes/settings/recovery-key/+page.svelte:102-112`

The copies have drifted: `2acb6196` fixed a permanent guard bypass after a
failed replay in the tryouts copy only; the others still `void goto(...)`.

Two screens built on `kit/detailDraft.svelte.ts` have no guard at all, and the
UI reader confirmed live (`.claude/audit-2026-10-03/ux2/flow1.mjs`): a reminder
edit (`settings/reminders/[id]`) and a document rename (`media/documents/[id]`)
vanish on the header Back and on browser back, while tryouts shows "Discard
unsaved changes?". `day/[day]` also uses detailDraft without a guard (not
driven).

V16: `/settings/reminders/<unknown id>` renders an empty editable form instead
of a not-found state.

## What to build

- `leaveGuard({ holding, onDiscard })`: owns the `beforeNavigate`
  registration, the replay (with the failure handling from `2acb6196`) and
  `pendingDeparture` / `keep()` / `discard()`. One `DiscardSheet.svelte`
  rendering from it, handles from `recordHandles.ts`.
- `detailDraft` uses it by default (opt-out for a screen that saves on
  change). That closes reminders, documents and day.
- Node tests over the decision logic with a fake navigation: holds when
  changed, replays on discard, a failed replay re-arms.
- Moving RecordSheet, regimen, tryouts and recovery-key onto it is in scope if
  it stays small; otherwise note it for after release.
- Reminders: not-found state for an unknown id.
- Add CONTEXT.md entry for **Draft** and the deliberate discard.

## Acceptance

- [ ] Back with unsaved changes on reminder edit, document rename and day
      detail shows the discard sheet; Keep editing keeps the edit.
- [ ] Node tests cover hold, discard and failed-replay re-arm.
- [ ] Unknown reminder id shows not-found.
- [ ] `/impeccable` pass done; sign-off crops of the sheet on the two screens,
      trans light and dark.
- [ ] Sheet arrival and dismissal sampled per frame: no yank.
