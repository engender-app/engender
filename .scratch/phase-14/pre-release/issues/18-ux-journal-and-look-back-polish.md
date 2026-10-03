# 18 - ux: Journal, Safe space, Photos and Look back polish

Status: ready-for-agent
Type: bug
Audit findings: U6, U8, U9, U10, U11, U12, U13, U14, U17, U18 (calendar strip only; the Look back marks are ticket 29)
Severity: P2 (U6), P3 (rest)
Blocked by: none
Size: M
Size note: one to two days
Model: sonnet
UI: yes. Mandatory `/impeccable` pass on each changed screen, then sign-off
and the no-yank clause from the spec.

Evidence for all: `.claude/audit-2026-10-03/ux1/` (`shots/`, `strips/`,
`flow/`), `report-ux1.md`.

## Problems and fixes

- **U6, tally undo deletes old records silently.**
  `src/routes/tally/+page.svelte:147-155` undoes the newest event of a kind,
  however old, through `journal.tally.deleteEvent` (`tally.ts:67`, a hard
  delete); the buttons (`:212-219`, `:250-257`) are always enabled, and only an
  `aria-live` count changes. Limit undo to events logged this visit (or today),
  and confirm with the date removed.
- **U8, timeline faces shift.** `kit.css:754` sizes the time column per row
  (`auto 26px ...`), so faces sit at x 68 for 13:49 and x 61 for 9:24, and the
  rail can kink. Fixed time column (about 4.5ch, right-aligned).
- **U9, one entry, two drawings.** `EntryCard` (Good moments, TagsReading,
  tryout detail) vs `DayEntry`/`EntryDays` (Calendar, Search, Day, On this day).
  Good moments moves to `EntryDays`; check the others.
- **U10, Things that help.** The trailing "move up" control is a rotated
  chevron (`doubt/comfort/+page.svelte:69-74`), visible but disabled on the
  first row, and reads as a collapse arrow; rows have no edit affordance. An
  Arrange mode with drag handles, and a chevron for edit. Mobbin references in
  the report under U10 (Evernote, Beli).
- **U11, Safe space.** "Things that help" is both a button and a row; the
  breathing dial shows "4·4·4·4" with no words. Say it once; label the pattern
  ("Breathe in 4, hold 4, out 4, hold 4").
- **U12, Photos.** Captions "Jun 26" and "Sept 24" read as days of the month
  (the label says "Milestone, 18 September 2024"); sticky year chips cover the
  third column (x 313 to 360). "Jun 2026"; chips into the gutter or a scrubber.
- **U13, Collage export.** Start and End show raw "2024-09-18"; "Selected
  photos: 36" appears above the grid and in the footer. Formatted dates; one
  count.
- **U14, Look back.** "Drag the ends to choose a stretch" sits over the lanes
  at rest; "Words that stand out" reads "asked / Era: Full time · Whole journal
  baseline"; `/stats/day-by-day` repeats "Day by day" as title and first h3.
- **U17, say it once.** Day's bar "1 October 2026 · 1 entry this day" repeats
  the header; Documents opens with what it cannot do, then "2 documents · 4 KB";
  empty Home shows Milestones and Care in both Pinned and Getting started.
- **U18, small targets.** Calendar strip days 9x24 (`.cal-day`); "Show month"
  is the equivalent, so WCAG passes, but widen the hit areas where layout
  allows. (Look back's `.span-tl-mark` 32x14 moved to ticket 29 with A04.)

## Acceptance

- [ ] Tally undo cannot remove an event from an earlier day without saying
      which; a test covers it.
- [ ] Each U8 to U18 item fixed, or left with a reason in Comments.
- [ ] `/impeccable` pass done; sign-off crops per change, trans light and dark.
- [ ] Arrange mode, chip moves and any reveal sampled per frame: no yank.
