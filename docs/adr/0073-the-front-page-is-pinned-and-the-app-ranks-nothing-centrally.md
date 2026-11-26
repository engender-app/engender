# The front page is pinned, and the app ranks nothing centrally

Status: Accepted
Decided: 2026-09-07
Last reviewed: 2026-11-02
Supersedes: ADR-0039 (merged in)

Today's pinned rows are the ones the person pinned, in the order they put
them. The app writes no pin, infers nothing from behaviour, and ranks no
area centrally. The live tiles Home draws are gated on data, sit in fixed
tiers, and each kind can be switched off by the person.

**Pins.** A pinned row is what somebody put on the front page and a hub
row is navigation. Both come from one registry but are different objects:
the hub groups and finishes its rows, and neither may happen to an
arrangement made by hand. A pin names a `hubRows.ts` row key, and a pin with
no row (unknown key, hidden area, duplicate) resolves to nothing, never
repaired or matched approximately. A finished area keeps its row and place.

**The default is resolved, not stored.** It comes from the onboarding
answer, held apart from the arrangement so "back to what I said" stays
computable. Unanswered, it falls back to `DEFAULT_ONBOARDING_AREAS`. Null,
empty and a list are three answers: nothing pinned shows nothing.

**No inference, now or later.** No reorder suggestions, no pin nudges, no
demotion of a row nobody opens.

**Live tiles are gated on data, with a switch per kind.** A tile appears
because its data says it is in use, never because of a preference that
substitutes for the check. Switching a kind off means "never show me this
kind", not "hide the instance that is true today".

## Live tiles: three tiers, three at a time

Each kind sits in one band (`LIVE_TILE_TIER` in `src/lib/data/liveTiles.ts`),
because order and visual weight both read off the band:

- `today`: true today and false tomorrow, such as a wear session running.
- `moment`: something that happened and is waiting, such as a letter that
  unlocked, a bad moment Safe Space can answer, the days after a surgery.
- `dormant`: a thing nothing is asking for. No kind sits there today.

The dose panel is a `moment`, since it qualifies while an episode is
active and as `today` it would be a permanent full-width row. On a day a
schedule expects a dose it rises to `today`, after a running wear session,
the one kind whose band moves with the day. Its line then names the dose.
An appointment on today's date is the agenda's today row, not a tile, and
the surgery tile starts the day after surgery.

`HOME_TILE_CAP` tiles show and the rest fold in place. Expanding raises
the cap, so order and weights hold either way. Tiers order tiles within
the live area; they are a fixed fact about each kind, not a ranking of the
person's areas.

## Why

**Live tiles are facts, not offers.** A running timer or active regimen is
true now. A preference to silence one would let somebody hide a binder timer
that is still running. A "moment" tile (a ready letter, a Safe Space nudge)
is an event, so it can be dismissed, each tile deciding how long: a
letter's dismissal is permanent because unlocked never reverts, a stock
notice's lasts a day. Dismissing one instance never disables the kind.

**Tiles read nothing while off.** A tile whose switch is off, or whose area
is hidden or finished, issues no read (`liveTiles.svelte.ts`).

**Own area.** Live tiles stay out of the look-back grid, whose contract
suits content offers.

**The person, not the app.** No ordering of the areas is right both for
somebody self-managing and for somebody four years into medical transition,
and the app cannot tell which it faces without watching, which it may not do.

**Row key, not archive section name (ADR-0052).** That rule is about records
that must outlive navigation renames. A pin says a row belongs on a screen,
and a row the registry no longer holds has no screen, so a pin that stops
resolving is the correct outcome, not data loss.

**A derived default, not an empty one.** A blank first screen is the app
declining to start. `DEFAULT_ONBOARDING_AREAS` is the one central guess
left, confined to a person who has not answered, and the medication row is
there because a person on HRT with no route to their doses on day one is
the case it exists for.

## Consequences

`pinnedRows.ts` is one pure function over the pins, the registry and area
state, and restates none of the registry. Two preferences travel in an
archive: the arrangement (`pinnedRows`) and the onboarding answer. The
tile switches are one `surfaceOverrides` preference holding only answers
that differ from the registry default, so they travel too. Today's editor
holds one switch per live-tile kind in draw order, and
`/settings/notifications` keeps the other registered kinds, reading
`isLiveTileKind` so no tile is switchable in two places.

A new area appears in the add list by being registered in `hubRows.ts`, and
on nobody's front page until they pin it.

## What is deliberately still wrong

`DEFAULT_ONBOARDING_AREAS` is rows the app picked, and nothing enforces the
no-inference rule at build time. This record is the guard, which is why the
rule is stated in its widest form.

## Considered and rejected

- **A per-instance dismiss on every live tile with no category switch.**
  Replaced by the per-kind switch.
- **Folding live tiles into the look-back grid.** It conflates content
  offers with status tiles.
- **Ranking better, centrally.** That is what the app had been doing.
- **Switches over the agenda's kinds.** Removed in October 2026, so
  the agenda draws every kind ADR-0067 admits.

History: decided 2026-09-07 (absorbs ADR-0055's tier decision); amended 2026-09-16 (tile switches on Today), 2026-10-21 (tiles and agenda switches cut; patch-schedule tile absorbed into the dose panel) and 2026-10-30 (`surfaceOverrides`); absorbed ADR-0039 (live tiles gated on data, dismissal by tile kind) 2026-11-02.