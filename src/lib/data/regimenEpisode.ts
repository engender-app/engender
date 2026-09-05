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

import { epochDayFromTimestamp, startOfDayTimestamp } from './epochDay';
import { rangesFromCuts, spanCoversDay } from './span';
import type { DoseEvent, RegimenEpisode } from './types';

/** Whether `episode` is in effect on `day`: started on or before it, and
    either still open (`endEpochDay` null) or ends on or after it. Delegates
    to span.ts's spanCoversDay (phase 8 deepening ticket 11); the arithmetic
    lives once. */
function isActiveOn(episode: RegimenEpisode, day: number): boolean {
  return spanCoversDay(episode, day);
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
    parameters against - not only its drug's name (attributeDrug below is
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

/** How a dose's drug name came out, for callers that only need the name -
    exposure totals and stock projection - and not an episode's ester or
    route (attributeDose above is for that). `ambiguous` is the only new
    way this can fail after ticket 38: a dose with no episode covering it
    at all resolves to `{ drug: null, ambiguous: false }`, the
    pre-existing, silent "nothing to attribute" case, and so does more
    than one active episode agreeing on the same drug (a dose change
    recorded as a new episode before the old one was ended, say - not an
    attribution problem this question has, unlike attributeDose, which
    also needs a single episode's ester and route and can't treat two
    same-drug episodes as interchangeable). Only when the active episodes
    actually name different drugs is there nothing honest to answer, and
    `ambiguous` comes back true so exposure totals and stock projection can
    count what they had to leave out. A dose's own `drug` (types.ts) is
    taken as-is when set, even without a backing episode (a person can
    name a drug stock or exposure should track without ever having logged
    an episode for it), and is never ambiguous. */
export function attributeDrug(
  episodes: readonly RegimenEpisode[],
  dose: Pick<DoseEvent, 'drug' | 'timestamp'>
): { drug: string | null; ambiguous: boolean } {
  if (dose.drug) return { drug: dose.drug, ambiguous: false };
  const active = activeEpisodesAt(episodes, dose.timestamp);
  if (active.length === 0) return { drug: null, ambiguous: false };
  const drugs = new Set(active.map((episode) => episode.drug.trim()));
  return drugs.size === 1 ? { drug: active[0].drug, ambiguous: false } : { drug: null, ambiguous: true };
}

/** One stretch of days over which a dose naming no drug of its own
    attributes the same way. `drug` and `ambiguous` carry exactly what
    `attributeDrug` answers for such a dose on any day in the stretch. */
export interface DrugSpan {
  fromEpochDay: number;
  toEpochDay: number;
  drug: string | null;
  ambiguous: boolean;
}

/** `[fromEpochDay, toEpochDay]` cut into the fewest stretches over which
    attribution is constant, oldest first, covering the range with no gap
    and no overlap. Empty for a range that runs backwards.

    For callers that need to count drug-less doses rather than resolve them
    one at a time (stockProjection.ts): attribution for such a dose depends
    only on which episodes cover its day, so it can only change where an
    episode starts or the day after one ends. Asking the question once per
    stretch instead of once per dose is what lets a count be taken over days
    rather than over rows, and the rule itself stays here - a caller gets
    spans, never the reasoning that made them.

    A dose that names its own drug is not covered by this: `attributeDrug`
    takes that name as-is regardless of the day, so it needs no span. */
export function drugSpans(
  episodes: readonly RegimenEpisode[],
  fromEpochDay: number,
  toEpochDay: number
): DrugSpan[] {
  /* Every day attribution could change on: an episode's first day, and the
     day after its last. An open episode never stops, so it contributes no
     end. rangesFromCuts drops the ones outside the window and closes the
     seams. */
  const cuts = episodes.flatMap((episode) =>
    episode.endEpochDay === null ? [episode.startEpochDay] : [episode.startEpochDay, episode.endEpochDay + 1]
  );

  return rangesFromCuts(cuts, fromEpochDay, toEpochDay).map((range) => ({
    ...range,
    ...attributeDrug(episodes, { drug: null, timestamp: startOfDayTimestamp(range.fromEpochDay) })
  }));
}

/** The first episode there has ever been - the one HRT overall started
    with, not whichever is active right now. Ticket 07's personal effects
    timeline anchors against this and nothing else, so the anchor does not
    shift when a second, different episode starts later. `episodes` must be
    sorted ascending by startEpochDay (ties broken by insertion order, the
    order journal.regimen.getEpisodes() returns). Null when there is no
    episode at all yet. Unaffected by episodes overlapping: "first ever"
    only ever meant the earliest start day, never that it was the only one
    active.

    The whole episode rather than only its start day, which is what this
    returned until phase 5 ticket 27: the effects timeline reads the
    anchor's `drug` as well, because the drug decides which literature
    table it is allowed to draw a band from, and its start day decides
    where that band is counted from. Both answers come off one episode, so
    the caller takes the episode. */
export function earliestEpisode(episodes: readonly RegimenEpisode[]): RegimenEpisode | null {
  return episodes[0] ?? null;
}
