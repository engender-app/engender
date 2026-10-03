# 03 - ux: Entry editor keeps its Save name, shows its date, says delete worked, and returns where you came from

Status: ready-for-agent
Type: bug
Audit findings: U1, U3, U4, U5
Severity: P1, blocks release (U1); the rest P2 on the same file
Blocked by: none
Size: M
Size note: one to two days
Model: sonnet
UI: yes. Mandatory `/impeccable` pass on the entry editor, the delete flow and
the return paths, then sign-off and the no-yank clause from the spec.

## Problems

**U1, Save has no accessible name (P1, regressed).** Commit `55e3b0ce`
(2 October) wrapped the label in a live region:
`EntryEditor.svelte:1456`
`<button data-save ...><span role="status">{...}</span></button>`.
The accessibility tree reads `button ""`; TalkBack says only "button" on the
most-used control in the app. Evidence: `.claude/audit-2026-10-03/ux1/ax.mjs`,
`ax2.mjs`.

**U3, the date line sits under the header.** `EntryEditor.svelte:1588` gives
`.editor-date` a negative top margin; measured header bottom 153.6, date top
145.6, `elementFromPoint` at the date's top edge returns the header. Visible in
`.claude/audit-2026-10-03/shots/entry-X-390-light-fold.png`.

**U4, edit or delete always lands on Today.**
`src/lib/navigation/sourceRecord.ts:7-8` honours `returnTo` only for photos,
milestones and documents. Save uses `sourceReturnTo(...) ?? '/'`
(`EntryEditor.svelte:840`), delete calls `goto('/')` (`:854`). Opened from
Calendar, Search, Day or On this day, both land on `/`, and a search is lost.

**U5, delete says nothing.** `EntryEditor.svelte:851-855` (`confirmDelete`)
shows no toast and has no error handling: if `deleteEntry` throws, the sheet
closes with nothing on screen. Trash is reachable only from a row near the
bottom of Settings.

## What to build

- Move the live region to a visually hidden sibling outside the button, so the
  button's name is its visible text and saving is still announced. Add an
  accessible-name assertion for Save to the walkthrough or a guard.
- Remove the negative margin; the date sits clear of the header at every
  width and text size.
- Return to the referrer for every list source (Calendar, Search, Day, On this
  day, Good moments): pass `returnTo` from `EntryDays`/`DayEntry` links and
  extend `sourceRecord.ts`, or fall back to smart back. Search keeps its query.
- Delete: "Moved to trash" with a Restore action (`trash_restored_toast`
  exists) and a visible error when the delete fails.

Reference patterns (Mobbin, in the report under U5): Toggl Track and CVS
Health, a full-width bar with Undo above the nav.

## Acceptance

- [ ] Save is announced by name in the accessibility tree; a check fails if
      it loses it again.
- [ ] Date line fully visible on new and existing entries at 390 and 1280.
- [ ] Save and delete from Calendar, Search, Day and On this day return there.
- [ ] Delete confirms with Restore; a failed delete says so.
- [ ] `/impeccable` pass done; sign-off crops (Save bar, date line, delete
      toast), trans light and dark.
- [ ] Toast arrival and departure sampled per frame: no yank.
