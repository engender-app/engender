# 16 - ux: Search shows results first and says its rules once

Status: ready-for-agent
Type: design
Audit findings: U7
Severity: P2
Blocked by: none
Size: M
Size note: one to two days
Model: sonnet
UI: yes. Mandatory `/impeccable` pass on Search and saved questions, then
sign-off and the no-yank clause from the spec.

## Problem

- The filter-scope copy ("Tags, moods, notes, photos and stars filter entries
  only." / "Dates also filter dated records in other areas.") appears three
  times: `src/routes/search/+page.svelte:472-473`, `:650`, and
  `src/routes/search/questions/[id]/+page.svelte:252-253`. "Search journal
  text and document titles. Accents are optional." also sits on the empty
  screen (`:524`).
- After typing, "Save this question" and "Random entry" sit above the results,
  so the first result starts at about y 530 of 844.
- "Save this question" is offered with zero results.
- Counts appear as "Entries: 27" on Search and "35 results ... Entries 21
  results" on a saved question.

Evidence: `.claude/audit-2026-10-03/ux1/flow/` (search captures),
`report-ux1.md` U7.

## What to build

- One plain line on the empty screen ("Searches your notes and document
  titles"); the filter scope moves into the Filters sheet.
- Results directly under the field; Save this question and Random entry after
  the results or in a header action, and Save hidden when nothing matched.
- One count format across Search and saved questions.
- Results arriving as you type must not yank (rows animate in; no row painted
  in place before it arrives).

Reference patterns (Mobbin, in the report under U7): Evernote folds filters
away and puts one count line above results; Todoist shows scope as chips with
the result first.

## Acceptance

- [ ] Each sentence about search scope appears once.
- [ ] First result within the first third of the screen at 390 px after
      typing.
- [ ] Save not offered for zero results.
- [ ] One count format.
- [ ] `/impeccable` pass done; sign-off crops (empty, results, saved question),
      trans light and dark.
- [ ] Result arrival sampled per frame while typing: no yank.
