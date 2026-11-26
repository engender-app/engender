# An era is a named span, and owns nothing else

Status: Accepted
Decided: 2026-09-01
Last reviewed: 2026-11-02
Supersedes: none

An **Era** is a named stretch of the
person's timeline (pre-HRT, first year, after I moved): a name and two
nullable bounds. It carries no colour, mute rule, photo policy, scale set or
other setting. Eras do not overlap, so a day belongs to at most one era and an
era filter partitions. A day in no era is a resting state. At most one era has
an open start and at most one an open end. A surface that needs a concrete
range from an open bound clamps to the data at read time and never stores the
clamp (ADR-0010).

## Why it owns nothing

This is [ADR-0048](0048-a-presentation-is-a-grouping-key-never-a-set-of-scales.md)
applied to the time axis. A presentation groups entries by how someone was
showing up; an era groups days by when. Both face the same pull: once a named
thing exists, every feature that needs a setting wants to hang one on it, and
it becomes a second Settings screen addressed by date.

The pull is concrete. The resurfacing consent layer wants a mute on the era,
a chart wants a colour, the calendar wants a shade. Granting any one means the
answer to "why does the app not resurface March 2024" lives on a row in the era
table and not in the consent registry, and the second such feature makes the
era the only place the two rules can be read together. So the consent layer
stores its own rule and references an era by id (`era_mute`, read through
`resurfacingConsent.ts`). A deleted era leaves a rule pointing at nothing,
which the registry reads as no rule, the same resting state a day in no era
already has.

Colour has the same answer. Charts resolve colour through `roleAt()` against
the active flag (`src/lib/theme/roles.ts`), so a stored era colour would be the
one colour in the app a palette switch cannot recolour.

## Considered options

- **Two annotations plus a name.** An annotation is a point, and an era is a
  span other surfaces adopt as a filter (`/compare` offers era against era, the
  chart annotation layer draws one, the milestone rail runs a band behind it).
  A filter needs an identity that outlives two marks.
- **Eras tile the timeline with no gaps.** A day in no era is a resting state,
  not "Uncategorized". Tiling would also force an era to begin the day the
  journal does, backdating a name onto a stretch nobody named.
- **Eras may overlap.** A day belongs to at most one era, so a filter
  partitions and an unfiltered read is the honest sum of its parts.

## Both bounds are nullable

`end = null` means still running, matching a regimen episode. `start = null`
means the era reaches back before the journal does. The era people most want to
name first is the one before everything, "before I knew", and it has no day
that begins it. Requiring a start would make them invent one, and an invented
date is what an era exists to stop. Defaulting it to the journal's first day
would be a specific false claim, that the era began with the journal. An era
with neither bound covers all time, which is one person's honest answer that
the whole journal is one chapter.

Two open starts would both reach back forever and overlap, so the invariant is
at most one open-start era and at most one open-end era, possibly the same one.
`eraConflict` in `src/lib/data/eras.ts` enforces it before a write, and the
editor asks the same function while the person types.

## Consequences

Closing an era and opening the next is two writes, and nothing stops a person
leaving a gap between them.

Every surface that adopts eras as a filter must handle the unfiltered case and
the no-era day, and neither is an empty state.

History: decided 2026-09-01; journaling-pause comparison and surfaces that no longer exist removed 2026-11-02.