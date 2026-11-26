/* Select what is waiting after time away (ADR-0039, ADR-0045).
   Keep gaps in the journal and report available items without counting
   missed doses, absent entries or elapsed days. A letter or milestone
   appears before housekeeping. Ask about only the latest dose slot.
   The layout reads this once per return, so logging it cannot promote
   another missed slot.

   Read existing rows and the last-write registry through
   comingBackReads.ts. Only comingBackSeenSince records that the return
   was shown. This selection receives today and uses no clock, journal
   handle or localized copy, so it runs on the Node tier. */

import { mostRecentPassedSlot } from './doseSchedule';
import { epochDayFromTimestamp } from './epochDay';
import type { DoseScheduleComparison } from './journal/doses';
import { eraCoversDay } from './eras';
import type { Era, Letter, Milestone, WearKind, WearSession } from './types';

/**
 * Treat a gap of three weeks as a return. Shorter stretches fit the
 * ordinary week and month views, and a two-week threshold would fire
 * during many holidays.
 *
 * Show the return at most once per gap. It stays in the
 * app and every row can be left alone.
 */
/* RETURN_GAP_DAYS stays exported for its own test, and cross-checked in
   comingBackReads.test.ts (AU-09 test-only review). */
export const RETURN_GAP_DAYS = 21;

/** How many rows one kind may contribute.

    A doorway, not an inbox. Somebody back after a year could have eight
    unlocked letters, and eight rows of them is a wall in front of a person
    who has just opened the app after a hard season. Three is what fits
    above the fold at 390px, and the screen that owns each kind is one tap
    from every row, so nothing is hidden - it is just not all here.

    Deliberately no "and four more": that is a count, and a count of what
    was waiting is one editing pass away from a count of what was
    missed. */
/* WAITING_PER_KIND stays exported only for its own test (AU-09 test-only
   review). */
export const WAITING_PER_KIND = 3;

/** One thing the journal is holding. Each arm carries only what its own
    row needs, so nothing can render a field another kind would have had to
    leave null - and so a screen narrowing on `kind` is left with `never`
    at the end of its chain if a kind is added and not handled. */
export type WaitingItem =
  | { kind: 'letter'; letterId: string; unlockEpochDay: number }
  | { kind: 'milestone'; milestoneId: string; name: string; epochDay: number }
  | { kind: 'era'; eraId: string; name: string; startEpochDay: number | null }
  | {
      kind: 'wear-session';
      sessionId: string;
      /** The row's own line: which day the session was started on. */
      startEpochDay: number;
      /** And the timestamp behind it, unrounded, because closing the
          session writes a duration measured from it. Carried rather than
          re-derived at the screen: a day converted back to a timestamp
          would move the start of a session the person never touched. */
      startTimestamp: number;
      /** Which practice it was, for the same reason the
          timestamp is carried: closing the session rewrites the whole row,
          and the sheet's own wording says which kind it is closing. */
      wearKind: WearKind;
    }
  | {
      kind: 'dose';
      slotEpochDay: number;
      episodeId: string;
      /** The episode's route in its own free-text words, unresolved.
          `matchDoseRoute` is what turns those into one of the six keys a
          dose is written with, and it needs the localised route words - so
          the sheet reads it the same way the dose log's own editor does,
          and this file stays free of paraglide. */
      episodeRoute: string;
      /** The drug in the episode's words, carried for the same reason the
          dose editor seeds it: a dose logged while one episode is active
          needs no drug of its own, and having it costs nothing when a
          second episode starts later. */
      drug: string;
      /** What the schedule was expecting in that slot, so the offer's sheet
          fills in a figure the person chose rather than one it invented -
          the slot's own amount where the schedule cycles them, and the
          episode's otherwise. */
      dose: number;
      doseUnit: string;
    };

/** Stable item key for dismissals during this visit and for walkthrough
    handles (ADR-0029). Combine the kind with its row ID. A dose uses its
    slot ID because it has no row yet. */
export function waitingItemKey(item: WaitingItem): string {
  switch (item.kind) {
    case 'letter':
      return `letter:${item.letterId}`;
    case 'milestone':
      return `milestone:${item.milestoneId}`;
    case 'era':
      return `era:${item.eraId}`;
    case 'wear-session':
      return `wear-session:${item.sessionId}`;
    case 'dose':
      return `dose:${item.slotEpochDay}`;
  }
}

/** Everything `whatIsWaiting` reads. Rows arrive already fetched, the way
    every `shouldShow*` predicate takes them, and each one is narrowed to
    the fields the selection actually uses. */
interface ComingBackInput {
  todayEpochDay: number;
  /** The gap being reported, from `returnGap` below - the day of the last
      write before it.

      A parameter rather than something this function works out for itself,
      and the reason is a bug it had when it did: backfilling one dose writes
      a row *inside* the gap, so the newest write moves forward, and a
      surface that recomputed the gap from the journal each time would have
      answered "no longer a return" halfway through somebody using it - the
      letter and the milestone they had not read yet vanishing off the screen
      because they logged a dose. A return is one gap, decided once, and the
      screen holds it for as long as it is up. */
  sinceEpochDay: number;
  letters: readonly Pick<Letter, 'id' | 'unlockEpochDay'>[];
  milestones: readonly Pick<Milestone, 'id' | 'name' | 'epochDay'>[];
  eras: readonly Pick<Era, 'id' | 'name' | 'startEpochDay' | 'endEpochDay'>[];
  runningWearSession: Pick<WearSession, 'id' | 'kind' | 'startTimestamp'> | null;
  /** `doses.getComparison` over the gap window. Its union already carries
      the reasons there is nothing to compare against, so this file asks
      about doses only in the one arm where a schedule exists. */
  doses: DoseScheduleComparison;
}

export interface ComingBack {
  /** The day of the last write before the gap. The return's own identity:
      what `comingBackSeenSince` stores, and so what makes this return one
      the person has already met or a new one. */
  sinceEpochDay: number;
  items: WaitingItem[];
}

/** The newest day any area answers with, or null where none does.

    A journal is written to in whichever area the person felt like that day,
    so the gap is the newest write anywhere and not any one area's. An area
    that answers null - nothing ever written there, or a deliberate opt-out
    from the registry - does not drag the gap backwards. */
/* lastWriteDay stays exported only for its own test (AU-09 test-only review). */
export function lastWriteDay(lastWrites: Partial<Record<string, number | null>>): number | null {
  let newest: number | null = null;
  for (const day of Object.values(lastWrites)) {
    if (day === null || day === undefined) continue;
    if (newest === null || day > newest) newest = day;
  }
  return newest;
}

/** The most recent rows first, capped. Newest rather than oldest because
    the newest arrival is the one the person has not met yet; the oldest is
    the one they were nearest to seeing before they stopped. */
function newestFew<T>(items: T[], dayOf: (item: T) => number): T[] {
  return [...items].sort((a, b) => dayOf(b) - dayOf(a)).slice(0, WAITING_PER_KIND);
}

/**
 * Exclude calendar plans from the gap calculation. Milestone dates,
 * appointments and the consults that procedures read can be set in
 * advance (ADR-0066). A planned date inside an absence would make the
 * last-write registry report a recent day and hide the return moment.
 * The registry still answers correctly for its other callers.
 */
/* PLANNED_AREAS stays exported only for its own test (AU-09 test-only review). */
export const PLANNED_AREAS = ['milestones', 'procedures', 'appointments'] as const;

/** How far back the median looks for a write to count. "Roughly the last year": long enough to see a person's own
    rhythm rather than one recent cluster, short enough that an area touched
    once, long ago, and never since does not sit in the sample forever. */
const MEDIAN_GAP_WINDOW_DAYS = 365;

/** The fewest distinct write-days the median trusts. Below this
    a "typical gap" is a guess dressed as a number - two data points are one
    gap, and one gap is not a rhythm. Chosen to still leave the floor as the
    only word for a journal in its first weeks, the same as before this
    ticket: `RETURN_GAP_DAYS` governs alone until there is enough history to
    say otherwise. */
const MIN_WRITE_DAYS_FOR_MEDIAN = 5;

/** Median gap between distinct entry and dose days in the last year. */
export function medianWriteGap(
  writeDays: readonly number[],
  todayEpochDay: number
): number | null {
  const cutoff = todayEpochDay - MEDIAN_GAP_WINDOW_DAYS;
  const recentDays = writeDays.filter(
    (day): day is number => day > cutoff && day <= todayEpochDay
  );
  const days = [...new Set(recentDays)].sort((a, b) => a - b);
  if (days.length < MIN_WRITE_DAYS_FOR_MEDIAN) return null;

  const gaps = days.slice(1).map((day, index) => day - days[index]).sort((a, b) => a - b);
  const mid = Math.floor(gaps.length / 2);
  return gaps.length % 2 === 0 ? (gaps[mid - 1] + gaps[mid]) / 2 : gaps[mid];
}

/**
 * Scale the threshold to 1.5 times the journal's median gap. A multiplier of 1 would treat roughly half of ordinary gaps as long enough. Daily journals still use the three-week `RETURN_GAP_DAYS` floor. A sparse journal with an eight-week median gets twelve weeks.
 */
const MEDIAN_GAP_MULTIPLE = 1.5;

/** Whether coming back now is a return, and which gap it is.

    The threshold, and the only place it is applied. Null where a journal has
    never been written to and where the gap is shorter than the threshold;
    otherwise the day of the last write before the gap, which is that
    return's own identity - what `comingBackSeenSince` stores and what
    `whatIsWaiting` is then asked about.

    The threshold itself is `RETURN_GAP_DAYS` or `MEDIAN_GAP_MULTIPLE` times
    the journal's own median write gap, whichever is greater: the
    floor never loosens, so a journal too young to have a median behaves
    exactly as it did before this ticket, and a journal with an established,
    wider rhythm is measured against its own pace rather than everyone's. */
export function returnGap(
  lastWrites: Partial<Record<string, number | null>>,
  todayEpochDay: number,
  writeDays: readonly number[] = []
): number | null {
  const written = Object.fromEntries(
    Object.entries(lastWrites).filter(([area]) => !PLANNED_AREAS.includes(area as never))
  );
  const since = lastWriteDay(written);
  if (since === null) return null;
  const median = medianWriteGap(writeDays, todayEpochDay);
  const threshold =
    median === null ? RETURN_GAP_DAYS : Math.max(RETURN_GAP_DAYS, MEDIAN_GAP_MULTIPLE * median);
  return todayEpochDay - since < threshold ? null : since;
}

/** What is waiting in the gap it is handed, or null if nothing is.

    Null is a real answer and the copy has one for it: a person can be away
    for three months and have the app hold nothing at all for them, and the
    honest thing then is to say so rather than to find something to show. */
export function whatIsWaiting(input: ComingBackInput): ComingBack | null {
  const since = input.sinceEpochDay;
  const items: WaitingItem[] = [];
  /* The window nobody was looking at: the day after the last write, up to
     and including today. A letter that unlocks this morning is as much a
     thing waiting as one that unlocked three weeks ago. */
  const arrivedInGap = (epochDay: number) => epochDay > since && epochDay <= input.todayEpochDay;

  for (const letter of newestFew(
    input.letters.filter((letter) => arrivedInGap(letter.unlockEpochDay)),
    (letter) => letter.unlockEpochDay
  )) {
    items.push({ kind: 'letter', letterId: letter.id, unlockEpochDay: letter.unlockEpochDay });
  }

  for (const milestone of newestFew(
    input.milestones.filter((milestone) => arrivedInGap(milestone.epochDay)),
    (milestone) => milestone.epochDay
  )) {
    items.push({
      kind: 'milestone',
      milestoneId: milestone.id,
      name: milestone.name,
      epochDay: milestone.epochDay
    });
  }

  /* The era the person is in, and only while it has no end. A closed era
     covering today cannot happen; an open one is the name they gave this
     stretch of their life, which is the one piece of context on this screen
     that is theirs rather than the app's. */
  const openEra = input.eras.find(
    (era) => era.endEpochDay === null && eraCoversDay(era, input.todayEpochDay)
  );
  if (openEra) {
    items.push({
      kind: 'era',
      eraId: openEra.id,
      name: openEra.name,
      startEpochDay: openEra.startEpochDay
    });
  }

  if (input.runningWearSession) {
    items.push({
      kind: 'wear-session',
      sessionId: input.runningWearSession.id,
      startEpochDay: epochDayFromTimestamp(input.runningWearSession.startTimestamp),
      startTimestamp: input.runningWearSession.startTimestamp,
      wearKind: input.runningWearSession.kind
    });
  }

  /* One slot, the most recent one that passed with nothing logged against
     it, and never today's. A slot on today has not passed yet, and Home's
     own dose panel is what asks about it - offering it here would make the
     return surface ask about a dose the person still has all day to take.

     `rows` is already the schedule's own answer, pauses removed
     (doseSchedule.ts): a break somebody declared is not a slot that went
     unlogged. */
  if (input.doses.reason === null) {
    const missed = mostRecentPassedSlot(input.doses.comparison, input.todayEpochDay);
    if (missed) {
      const episode = input.doses.activeEpisode;
      items.push({
        kind: 'dose',
        slotEpochDay: missed.slot.epochDay,
        episodeId: episode.id,
        episodeRoute: episode.route,
        drug: episode.drug,
        dose: missed.slot.amount?.dose ?? episode.dose,
        doseUnit: missed.slot.amount?.doseUnit ?? episode.doseUnit
      });
    }
  }

  if (items.length === 0) return null;
  return { sinceEpochDay: since, items };
}
