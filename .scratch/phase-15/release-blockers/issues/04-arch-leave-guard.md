# 04 - arch: One leave guard for every draft

Status: ready-for-agent
Was: phase-14 pre-release 10 (moved 2026-10-05)
Type: bug
Audit findings: A1, V02, V16
Severity: P2
Blocked by: none
Size: M (was S; grew with the 2026-10-05 audit)
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

## Audit 2026-10-05

Confirmed unbuilt (`grep leaveGuard src` is empty), and the audit adds two
surfaces. The entry-editor part is release-blocking (B4). With it the ticket is
M rather than S. Reports: `.claude/audit-2026-10-05/report-ux.md`,
`report-L05.md`, `report-arch.md`, `report-L07.md`.

- **UX-01 (P1, blocks release).** The entry editor throws away unsaved text on
  browser back, the header arrow, Android hardware back (it goes through
  `window.history.back()`, `android/platform-sync.ts:324-337`) and a nav tab,
  with no discard question. `EntryEditor.svelte:151-153` cancels only while
  saving, and `onDestroy` (`:302-306`) clears the draft mirror on every normal
  departure. A reload keeps the draft, so the protection exists but is wired to
  the wrong event. Live run `ux/entry3.mjs`: an edited existing entry and a new
  one both lost their text on Back.
- **L05-02 (P2, PLAUSIBLE).** The voice benchmark keeps the recorded takes and
  note only in component state (`VoiceBenchmarkFlow.svelte:125-146`); a tab
  change to Compare (`routes/voice/+page.svelte:468`) or Back unmounts it, with
  no `beforeNavigate` anywhere in voice.
- **ARCH-03 (P2).** The four `beforeNavigate` copies still drift (only tryouts
  catches a failed replay); `settings/reminders/[id]` and
  `media/documents/[id]` have no guard; CONTEXT.md has no **Draft**. Note from
  the architecture reader: `recordEditor.svelte.ts` and `detailDraft.svelte.ts`
  already expose `{changed, saving, discard}`; make that shape the guard's
  input.
- **L07-07 (P2).** Same evidence from the routes reader: no not-found state for
  an unknown reminder id; regimen and recovery-key still `void goto` with no
  re-arm.

New acceptance:

- [ ] The entry editor, new and existing, holds on Back, the header arrow,
      Android back and a nav tab whenever the draft differs from what was
      loaded, and shows the discard sheet; Keep editing keeps the text. A
      walkthrough check covers all four exits.
- [ ] The voice benchmark's summary step, and its Segmented tab change, hold
      the same way while a take is unsaved.
