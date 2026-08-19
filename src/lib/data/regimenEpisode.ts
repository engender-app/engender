/* Regimen episode resolution (CONTEXT: "Regimen episode", ADR-0010): pure
   questions over a list of episodes and a timestamp, kept above the
   journal seam the same way milestoneStatus.ts is - nothing here reads a
   clock or a database, so downstream tickets (02 onward) call it against
   whatever episodes journal.regimen.getEpisodes() already returned, rather
   than each re-deriving "which episode was this logged under".

   Phase 5 ticket 38 widened this from "the one episode active at a
   timestamp" to "the set of episodes active at a timestamp": an episode's
   end is now a stored, explicit day (types.ts), so more than one episode
   can be active on the same day when they are for different drugs. A dose
   still usually names no drug of its own, so most attribution still comes
   down to "is exactly one episode active" - activeEpisodesAt and
   attributeDose are the two questions everything else in this file used to
   answer with resolveEpisodeAt alone. */

import { epochDayFromTimestamp } from './epochDay';
import type { DoseEvent, RegimenEpisode } from './types';

/** Whether `episode` is in effect on `day`: started on or before it, and
    either still open (`endEpochDay` null) or ends on or after it. */
function isActiveOn(episode: RegimenEpisode, day: number): boolean {
  return episode.startEpochDay <= day && (episode.endEpochDay === null || episode.endEpochDay >= day);
}

/** Every episode in effect at `timestamp` - zero, one, or several when more
    than one drug's episode overlaps that day. `episodes` need not be
    sorted for this question; the order only matters where downstream code
    still keys off a "next" episode (timeOnEachRegimen and friends, which
    read `startEpochDay`/`endEpochDay` directly and no longer infer one
    from the other). Hidden episodes still resolve: hiding takes an episode
    out of pickers, not out of history. */
export function activeEpisodesAt(episodes: readonly RegimenEpisode[], timestamp: number): RegimenEpisode[] {
  const day = epochDayFromTimestamp(timestamp);
  return episodes.filter((episode) => isActiveOn(episode, day));
}

/** How a dose's episode attribution came out: `episode` set when it
    resolved to exactly one; `episode: null, ambiguous: true` when it
    could not be told apart from another equally plausible one (more than
    one episode active, or a named drug that does not pick out exactly
    one of them); `episode: null, ambiguous: false` when there was nothing
    to resolve against at all (no episode covers the timestamp), which is
    the pre-existing "logged before any episode existed" case and not a
    new kind of failure ticket 38 introduces.

    The distinction exists so a caller can count only the new, ambiguous
    kind of exclusion (ticket 38's "counted and surfaced") without
    changing what an existing single-episode journal already showed for
    the old kind. */
export type DoseAttribution =
  | { episode: RegimenEpisode; ambiguous: false }
  | { episode: null; ambiguous: boolean };

/** Which episode `dose` belongs to, for reading its drug, ester and route
    parameters against - not only its drug's name (attributedDrug below is
    for that). A dose's own `drug` (types.ts) wins when set: it must match
    exactly one episode active at the dose's timestamp, or attribution is
    ambiguous. With no `drug` of its own, the dose falls back to the sole
    active episode, exactly as every single-episode journal already
    resolved before ticket 38 - so an existing journal, where at most one
    episode is ever active on any given day, is unaffected either way. */
export function attributeDose(
  episodes: readonly RegimenEpisode[],
  dose: Pick<DoseEvent, 'drug' | 'timestamp'>
): DoseAttribution {
  const active = activeEpisodesAt(episodes, dose.timestamp);

  if (dose.drug) {
    const named = dose.drug.trim();
    const matching = active.filter((episode) => episode.drug.trim() === named);
    return matching.length === 1 ? { episode: matching[0], ambiguous: false } : { episode: null, ambiguous: true };
  }

  if (active.length === 1) return { episode: active[0], ambiguous: false };
  return { episode: null, ambiguous: active.length > 1 };
}

/** Which drug `dose` counts against, for callers that only need the name -
    exposure totals and stock projection - and not an episode's ester or
    route. A dose's own `drug` is taken as-is when set, even without a
    backing episode (a person can name a drug stock or exposure should
    track without ever having logged an episode for it). Otherwise, every
    active episode's drug has to agree: two overlapping episodes for the
    *same* drug (a dose change recorded as a new episode before the old one
    was ended, say) are not an attribution problem this question has -
    unlike attributeDose, which also needs a single episode's ester and
    route and can't treat two same-drug episodes as interchangeable. Only
    when the active episodes actually name different drugs is there
    nothing honest to answer. */
export function attributedDrug(
  episodes: readonly RegimenEpisode[],
  dose: Pick<DoseEvent, 'drug' | 'timestamp'>
): string | null {
  if (dose.drug) return dose.drug;
  const active = activeEpisodesAt(episodes, dose.timestamp);
  if (active.length === 0) return null;
  const drugs = new Set(active.map((episode) => episode.drug.trim()));
  return drugs.size === 1 ? active[0].drug : null;
}

/** Whether `dose` could not be given a single drug name at all: it named
    none of its own, and the episodes active at its timestamp disagree on
    what drug they are. The only new way attribution can fail after ticket
    38 - a dose with no episode covering it at all is the pre-existing,
    silent "nothing to attribute" case and is not this, and neither is more
    than one episode agreeing on the same drug (attributedDrug's own
    reasoning). attributedDrug itself only answers with a name or null and
    cannot say which kind of null that was; exposure totals and stock
    projection use this to count what it had to leave out. */
export function isAmbiguousDrug(
  episodes: readonly RegimenEpisode[],
  dose: Pick<DoseEvent, 'drug' | 'timestamp'>
): boolean {
  if (dose.drug) return false;
  const active = activeEpisodesAt(episodes, dose.timestamp);
  const drugs = new Set(active.map((episode) => episode.drug.trim()));
  return drugs.size > 1;
}

/** The first episode there has ever been - the one HRT overall started
    with, not whichever is active right now. Ticket 07's personal effects
    timeline anchors against this and nothing else, so the anchor does not
    shift when a second, different episode starts later. `episodes` must be
    sorted ascending by startEpochDay (ties broken by insertion order, the
    order journal.regimen.getEpisodes() returns); hidden episodes still
    count, the same as they still resolve. Null when there is no episode at
    all yet. Unaffected by episodes overlapping: "first ever" only ever
    meant the earliest start day, never that it was the only one active.

    The whole episode rather than only its start day, which is what this
    returned until phase 5 ticket 27: the effects timeline reads the
    anchor's `drug` as well, because the drug decides which literature
    table it is allowed to draw a band from, and its start day decides
    where that band is counted from. Both answers come off one episode, so
    the caller takes the episode. */
export function earliestEpisode(episodes: readonly RegimenEpisode[]): RegimenEpisode | null {
  return episodes[0] ?? null;
}
