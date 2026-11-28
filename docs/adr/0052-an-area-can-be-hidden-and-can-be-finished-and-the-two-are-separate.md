# An area can be hidden, and can be finished, and the two are separate

Status: Accepted
Decided: 2026-09-03
Last reviewed: 2026-11-02
Supersedes: none

One sparse row per area in `area_state` holds whether the area is hidden, the
day the person says it finished, and, for the areas in `SUSPENDABLE_AREAS`
only, the day they paused it. Hidden and finished are independent. A stream is active, suspended
or finished, never two of those at once. The key is an `ArchiveSectionName`.
`src/lib/data/areaState.ts` holds the questions every surface asks:
`areaHidden`, `areaQuiet` (hidden, finished or suspended on or before today)
and `areasHidden` (a surface's list of sections), and nothing re-derives them
from columns.

## Why

Parts of a transition finish: dilation tapers off, the last electrolysis
session is the last one, a name change happens once. The app's only word for
"I am no longer doing this" was to stop writing rows, which reads as absence,
and every living tracker reads a stopped stream as a lapse, with a nudge that
keeps nudging, a tile that keeps counting days since and a chart that keeps
drawing a gap. For a transition that is false in the direction that hurts.

### Hidden and finished are two columns

A finished stream is still readable. So finishing does not hide, and a screen showing a finished
area shows it in full. Hiding is the other statement: an area never really used
can be hidden without being finished, because there was no practice to declare
over.

### A date, not a flag

`finished_epoch_day` is one column more than a boolean and pays for itself
at once. Chart annotations can draw the day a stream ended beside the regimen
changes and pauses they already draw, and a clinician summary can say when a
stream stopped. Per ADR-0010 the day is stored because it is the person's own
assertion and not derivable. Whether the finish has happened yet is read at
read time and never stored, the rule ADR-0049 applies to an open era bound.

### The key is an archive section name

A section is already the canonical answer to "does this area exist". ADR-0027
makes a registry entry the thing that makes an area travel, it is already the
space `day.ts` and `textSearch.ts` check exhaustiveness against, and it is a
wire key that cannot be renamed casually. Two hub rows front more than one
section (voice is `voiceBenchmarks` plus `voicePracticeTakes`, voice is
`voiceBenchmarks` plus `voicePracticeTakes`). The record stays at section
granularity because that is compile-checked and wire-stable, and such a row
finishes its sections together in one transaction. A row reads as finished only
when all its sections are.

## What can be finished

Finishing is a statement about a practice of tracking. It fits an accumulating
dated series the person decides they are done adding to, and says nothing on a
thing that already ends itself: a tryout has an end day, an era ends when the
person ends it, a letter is sealed and then unlocked, a procedure has a
recovery window, an episode carries the day the course stopped. An area-level
finish on those repeats the statement one level down.

`FINISHABLE_AREAS` lists what qualifies, approved area by area, and every other
section owes a written reason in `NOT_FINISHABLE`, so a new archive section does
not compile until someone declares it finishable or says why not.

## Suspended

A temporary pause, not an end, exists only for `hairRemovalSessions`,
`voiceBenchmarks` and `voicePracticeTakes` (`SUSPENDABLE_AREAS`), the areas
where someone named a real case. It is `suspended_epoch_day`, the same shape and
reasoning as the finish day. Finished and suspended are mutually exclusive: the
writers in `journal/areaStates.ts` clear the one when setting the other.
`areaQuiet` folds the suspend day into the question it already asks, so the
prompt-and-tile cascade gains an input and not a state to reason about. A
suspended row is not grouped with the finished ones, because it is not done. It
sits under its own heading with a "Paused since" line. The list grows only when
another area names a case.

## The carve-out for cycle tracking

`cycleEvents` is outside the hideable set structurally. `HideableArea` excludes
it and the record is keyed by that type, so `states.cycleEvents` does not
compile and neither gate can be asked about cycle tracking. The read also drops
such a row, because an `area_state` row travels and an archive from elsewhere
could otherwise reverse the rule through the back door. Cycle visibility is its
own gate, `cycleTrackingVisible`, with an explicit choice winning over any
regimen (ADR-0092). A uniform flag defaulting to shown would delete both that
asymmetry and the data-driven unhide.


## Consequences

Nothing is deleted and nothing is refused. Hiding removes an area from
navigation, the records stay, the screen answers at its address and a bookmark
keeps working. Finishing records a day.

Search is deliberately not a caller. A hidden or finished area stays
searchable, because a search that stops finding what someone wrote would make
the app quietly lose records they can still remember writing.

Un-finishing is the same call with `null` and stays exactly as easy as
finishing, because a stream can restart. No copy says "completed".

The `*Enabled` preferences are not retired. They govern whether a kind of
prompt fires (the `prefKey` axis in `src/lib/unprompted/registry.ts`), a
different question from whether an area is hidden. Conflating them grows a
second Settings screen.

An absent row is the resting state. Nothing writes a row to say nothing, and a
state that returns to saying nothing takes its row with it.

History: amended 2026-09-05 (the surface-level `areasHidden` question; a third state, suspended, for two areas, later three); counts removed 2026-11-02.

Amended 2026-11-26: hair progress (`hairStages`, `hairPhotos`) folded into progress photos and left the finishable areas (schema 124).
