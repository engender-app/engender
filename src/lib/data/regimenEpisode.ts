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

import { expectedSlots, isDailySchedule, nearestOpenSlotDistance, pauseCoversDay } from './doseSchedule';
import { epochDayFromTimestamp, startOfDayTimestamp } from './epochDay';
import { rangesFromCuts, spanCoversDay } from './span';
import type { DoseEvent, DoseSchedule, DosePause, DoseScheduleAmount, RegimenEpisode } from './types';

/** Whether `episode` is in effect on `day`: started on or before it, and
    either still open (`endEpochDay` null) or ends on or after it. Delegates
    to span.ts's spanCoversDay; the arithmetic
    lives once. */
function isActiveOn(episode: RegimenEpisode, day: number): boolean {
  return spanCoversDay(episode, day);
}

/** A stable key for grouping free-text drug names. Identity comparisons use
    sameDrug; counters use this key so their groups follow the same rule. */
export const drugNameKey = (drug: string): string => drug.trim().toLowerCase();

/** Whether two stored drug names name the same drug, ignoring surrounding
    whitespace and case. Attribution, stock, Care and quick log share it. */
export const sameDrug = (a: string, b: string): boolean => drugNameKey(a) === drugNameKey(b);

/** The first day of the unbroken run of `episode`'s drug that `episode`
    ends: its own start, walked back over every episode of the same drug
    that reaches up to the day before it or overlaps it. A dose change
    saved as a new episode the day after the old one ended is still the
    same course, so "taking since" names when the course began, not when
    the dose last changed. A day with no episode of the drug breaks it. */
export function continuousSince(episodes: readonly RegimenEpisode[], episode: RegimenEpisode): number {
  const same = episodes.filter((other) => sameDrug(other.drug, episode.drug));
  let since = episode.startEpochDay;
  for (;;) {
    const earlier = same.filter(
      (other) => other.startEpochDay < since && (other.endEpochDay === null || other.endEpochDay >= since - 1)
    );
    if (!earlier.length) return since;
    since = Math.min(...earlier.map((other) => other.startEpochDay));
  }
}

/** Every episode covering the timestamp's calendar day, including hidden
    episodes and concurrent regimens. */
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

/** The title already names a resolved drug, including concurrent regimens.
    Keep attribution text only when the row has no drug to name. */
export const showAttributionLabel = (
  attribution: DoseAttribution,
  drug: string | null
): boolean => attribution.episode ? drug === null || !sameDrug(attribution.episode.drug, drug) : drug === null;

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
    const named = dose.drug;
    const matching = active.filter((episode) => sameDrug(episode.drug, named));
    return matching.length === 1 ? { episode: matching[0], ambiguous: false } : { episode: null, ambiguous: true };
  }

  if (active.length === 1) return { episode: active[0], ambiguous: false };
  return { episode: null, ambiguous: active.length > 1 };
}

/** Resolve the drug name for exposure and stock, without selecting
    an episode, ester or route. An explicit dose drug wins. With no
    active episode, return `{ drug: null, ambiguous: false }`.
    Episodes that agree give their shared drug. Conflicting active
    episodes return null with `ambiguous: true` so callers can report
    the exclusions. */
export function attributeDrug(
  episodes: readonly RegimenEpisode[],
  dose: Pick<DoseEvent, 'drug' | 'timestamp'>
): { drug: string | null; ambiguous: boolean } {
  if (dose.drug) return { drug: dose.drug, ambiguous: false };
  const active = activeEpisodesAt(episodes, dose.timestamp);
  if (active.length === 0) return { drug: null, ambiguous: false };
  return active.every((episode) => sameDrug(episode.drug, active[0].drug)) ? { drug: active[0].drug, ambiguous: false } : { drug: null, ambiguous: true };
}

/** The last day of `from`..`to` on which `episode` can expect a dose: `to`
    itself, or the episode's own planned end when that comes first. Null
    when the episode misses the range, starting after it or ending before
    it. The day-ahead marks read every episode through this, so a course that ends on Friday expects nothing the week
    after and one that starts next week still has its first dose there. */
export function lastDayWithin(
  episode: Pick<RegimenEpisode, 'startEpochDay' | 'endEpochDay'>,
  from: number,
  to: number
): number | null {
  if (episode.startEpochDay > to) return null;
  const last = Math.min(to, episode.endEpochDay ?? to);
  return last < from ? null : last;
}

/** One stretch of days over which a dose naming no drug of its own
    attributes the same way. `drug` and `ambiguous` carry exactly what
    `attributeDrug` answers for such a dose on any day in the stretch. */
interface DrugSpan {
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

/** Default a drug-less dose to its only active episode, or to the
    unique schedule with the nearest open slot to `todayEpochDay`.
    Ties, no eligible schedule and as-needed episodes leave the picker
    to ask.

    Use the full episode list to attribute existing doses first.
    Scope pauses to the episode before matching; otherwise one
    episode's pause can blank another's slot. */
export function nearestActiveEpisode(
  episodes: readonly RegimenEpisode[],
  active: readonly RegimenEpisode[],
  schedules: readonly DoseSchedule[],
  pauses: readonly DosePause[],
  doses: readonly DoseEvent[],
  todayEpochDay: number,
  maxRadiusDays: number
): RegimenEpisode | null {
  if (active.length <= 1) return active[0] ?? null;

  const distances = active.map((ep) => {
    const schedule = schedules.find((s) => s.episodeId === ep.id);
    if (!schedule) return { episode: ep, distance: null as number | null };
    const episodeDoses = doses.filter((dose) => attributeDose(episodes, dose).episode?.id === ep.id);
    const episodePauses = pauses.filter((pause) => pause.episodeId === ep.id);
    return {
      episode: ep,
      distance: nearestOpenSlotDistance(schedule, ep.startEpochDay, episodeDoses, episodePauses, todayEpochDay, maxRadiusDays)
    };
  });

  const known = distances.filter((d): d is { episode: RegimenEpisode; distance: number } => d.distance !== null);
  if (known.length === 0) return null;
  const nearest = Math.min(...known.map((d) => d.distance));
  const winners = known.filter((d) => d.distance === nearest);
  return winners.length === 1 ? winners[0].episode : null;
}

/** One slot a schedule expects on a given day, with the episode it belongs
    to named (phase 11 ticket 20, audit item 12). `dayAhead` answers which
    days carry a slot and stops there - ADR-0067's mark is a day and a kind
    and never an amount - so the forward day view asks this instead when it
    has a day in hand and owes the person what is expected on it. */
export interface ExpectedDose {
  episodeId: string;
  drug: string;
  amount: DoseScheduleAmount | null;
  /** Which of the day's slots this is, and how many there are - the pair
      `adherence_slot_numbered` already words. */
  indexInDay: number;
  dosesPerDay: number;
}

/** Every slot the active schedules expect on `epochDay`, in episode order.
    The same loop `dayAhead`'s own `doseSlot` section runs, carrying the
    episode and the slot's amount rather than throwing them away: episodes
    active on the day, their schedule, that schedule's slots, minus the days
    a pause of that episode's own covers.

    A daily schedule is skipped here for the reason it is skipped there - a
    slot on every day is wallpaper rather than a fact, and a day view that
    listed one would disagree with the mark that is not on its calendar
    cell.

    `activeEpisodesAt` is asked about the day itself rather than about
    today: this describes a day, and an episode that starts next week is
    what that day expects even though it expects nothing now. */
export function expectedDosesOnDay(
  episodes: readonly RegimenEpisode[],
  schedules: readonly DoseSchedule[],
  pauses: readonly DosePause[],
  epochDay: number
): ExpectedDose[] {
  const expected: ExpectedDose[] = [];

  for (const episode of activeEpisodesAt(episodes, startOfDayTimestamp(epochDay))) {
    const schedule = schedules.find((s) => s.episodeId === episode.id);
    if (!schedule || isDailySchedule(schedule)) continue;
    const ownPauses = pauses.filter((pause) => pause.episodeId === episode.id);

    for (const slot of expectedSlots(schedule, episode.startEpochDay, epochDay, epochDay)) {
      if (ownPauses.some((pause) => pauseCoversDay(pause, slot.epochDay))) continue;
      expected.push({
        episodeId: episode.id,
        drug: episode.drug,
        amount: slot.amount,
        indexInDay: slot.indexInDay,
        dosesPerDay: schedule.dosesPerDay
      });
    }
  }

  return expected;
}
