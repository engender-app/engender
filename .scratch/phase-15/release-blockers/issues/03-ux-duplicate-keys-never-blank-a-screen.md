# 03 - ux: Two tags with the same name never blank a list

Status: ready-for-agent
Was: phase-14 pre-release 37 (moved 2026-10-05)
Type: bug
Audit findings: L06-01, L05-13 (blocker B3 in the audit's clusters)
Severity: P1 (L06-01), the audit calls it release-blocking; P3 (L05-13)
Blocked by: none
Size: S
Size note: under a day
Model: sonnet
UI: no (copy only: a refusal line if duplicate tag names are refused). No
`/impeccable` pass unless the refusal needs more than a line.

Source: full audit of 5 October 2026, run on main 2e362652. origin/main was
22 commits ahead by then (REL-09), so re-check each finding on the current main
before fixing it. Reports, probes and shots are under
`.claude/audit-2026-10-05/` (`report-<reader>.md` per reader).

## Problem

Svelte 5 throws `each_key_duplicate` in production builds too
(`node_modules/svelte/src/internal/client/dom/blocks/each.js:355-361`), and the
app has no `<svelte:boundary>`, so a repeated key blanks the whole screen.

- **L06-01 (P1).** `kit/DayEntry.svelte:136` keys tags by label: `{#each tags ??
  [] as tag (tag)}`; `entryTags()` (`vocabulary/entryTags.ts:22-30`) returns
  labels; `journal.tags.addTag` and `renameTag` (`journal/tags.ts:101-115`) do
  not enforce unique labels. Repro (`L06/probe3.mjs`): add a custom tag called
  "social dysphoria" in Settings > Tags, tick both "social dysphoria" chips on a
  new entry, save. Page error `each_key_duplicate`; Home and /calendar render 0
  `[data-entry-card]`, and Journal's "Recent entries" stays a skeleton
  (`L06/dup-tag-calendar.png`). One ordinary action makes every entry disappear
  from Home and Journal. Report: `report-L06.md`.
- **L05-13 (P3, PLAUSIBLE).** `PitchFigure.svelte:452,536` key `{#each
  [span.highHz, span.lowHz] as edge (edge)}` (also `:396`); equal ends happen
  with a single voiced frame (`audio/pitch.ts:285-286`) or an imported
  `.ttbackup` row (`f0_p10_hz REAL`, no check), and the voice compare or
  summary screen would blank. Report: `report-L05.md`.

## What to build

- Key DayEntry's tags by index or by `{id, label}` pairs.
- Decide with Alicja whether two tags in different groups may share a label
  (the repro is a custom tag beside a built-in). Either way the lists must not
  crash; if same-group duplicates are refused, `addTag`/`renameTag` say so in
  one line.
- PitchFigure: key by index, or draw one line when the two edges are equal.
- Sweep every keyed `{#each}` whose key is a label or a value that can repeat,
  and fix the same way; list what the sweep found in Comments.

## Acceptance

- [ ] The repro saves, and Home, Journal and the calendar show the entry with
      both tags (a browser check).
- [ ] PitchFigure renders with equal band edges (test).
- [ ] The sweep's list is in Comments, each item fixed or explained.
