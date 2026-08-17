/* Which period a wrapped covers, and which one Home offers today (phase 4
   features ticket 01).

   A wrapped is a retrospective on a *completed* week, month or year
   (CONTEXT: Wrapped). Nothing here reads the clock and nothing here reads
   the journal: today arrives as an argument, the answer is a pair of epoch
   days, and the numbers inside that range come from the recap seam
   (journal/stats.ts) at the moment a screen asks for them. That is what
   keeps a wrapped from drifting out of step with later edits to the entries
   it summarizes - there is no stored wrapped to drift.

   Kept beside epochDay.ts rather than in a screen because both rules below
   are calendar arithmetic with awkward edges - the previous week across a
   year boundary, three cadences colliding on 1 January - and a rule that
   needs a browser to ask is a rule nobody checks. */

import {
  localDateFromEpochDay,
  previousCalendarMonthRange,
  previousCalendarWeekRange,
  previousCalendarYearRange
} from './epochDay';

export type WrappedCadence = 'week' | 'month' | 'year';

/** Longest first, which is also the order Home prefers them in below. */
export const WRAPPED_CADENCES = ['year', 'month', 'week'] as const satisfies readonly WrappedCadence[];

/** How many entries a period needs before its wrapped is worth opening.

    One number for all three cadences, deliberately: a floor picked per
    cadence would be three judgements to keep in step, and the thing being
    judged is the same either way - whether there is enough in the period to
    fill a screen rather than a screen of empty sections. Five is the point
    where the arcs, the tags and the streak all have something to say; below
    it a wrapped is a list of ones and zeroes. */
export const WRAPPED_ENTRY_FLOOR = 5;

/** How long after a period ends its wrapped stays on offer, per cadence.

    Not one number, because "just ended" is relative to how long the period
    was: a week-old weekly wrapped is stale and a week-old yearly one is
    still news. The week's window can never expire - the previous
    Monday-to-Sunday week always ended one to seven days ago - so it is the
    fallback the other two displace while they are fresh. */
export const WRAPPED_FRESH_DAYS: Record<WrappedCadence, number> = {
  week: 7,
  month: 14,
  year: 31
};

export interface WrappedPeriod {
  cadence: WrappedCadence;
  /** Both ends inclusive, the way the recap seam takes a range. */
  start: number;
  end: number;
  /** The calendar year the period falls in, carried rather than left for a
      screen to dig back out of `start`: the range functions have already
      worked it out, and two screens name the same period. */
  year: number;
  /** 0-based, and null for a week or a year, which are not named by a month.
      A week can straddle two months, so there is no honest answer for it. */
  month: number | null;
}

/** The most recent finished period of one cadence, as of `todayEpochDay`. */
export function completedWrappedPeriod(cadence: WrappedCadence, todayEpochDay: number): WrappedPeriod {
  if (cadence === 'month') {
    const range = previousCalendarMonthRange(todayEpochDay);
    return { cadence, start: range.start, end: range.end, year: range.year, month: range.month };
  }
  if (cadence === 'year') {
    const range = previousCalendarYearRange(todayEpochDay);
    return { cadence, start: range.start, end: range.end, year: range.year, month: null };
  }
  const range = previousCalendarWeekRange(todayEpochDay);
  return {
    cadence,
    start: range.start,
    end: range.end,
    /* The year the week ended in, so a week spanning New Year is named by the
       year it finished in rather than the one it opened in. Only used to
       label the period; the range itself is what the recap reads. */
    year: localDateFromEpochDay(range.end).getFullYear(),
    month: null
  };
}

/** The one wrapped Home offers today: the longest cadence still inside its
    freshness window.

    Ranked by cadence rather than by which period ended most recently, and
    the two disagree for most of a month. On 14 February the previous week
    ended yesterday and January ended a fortnight ago, and January is the
    better offer - it is the bigger retrospective, and it is still new
    enough to be worth reading. Ranking by end date instead would put the
    weekly card on Home nearly every day and leave the yearly one a
    three-day appearance in January.

    Always returns a period, because the week always has one. What decides
    whether Home actually shows a card is the entry floor above and the
    wrapped preference - not this. */
export function offeredWrappedPeriod(todayEpochDay: number): WrappedPeriod {
  const fresh = WRAPPED_CADENCES.map((cadence) => completedWrappedPeriod(cadence, todayEpochDay)).find(
    (period) => todayEpochDay - period.end <= WRAPPED_FRESH_DAYS[period.cadence]
  );
  // The week is unconditionally fresh, so `find` cannot come back empty -
  // the fallback is here for the compiler, not for a reachable case.
  return fresh ?? completedWrappedPeriod('week', todayEpochDay);
}
