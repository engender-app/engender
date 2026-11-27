/* Candidate dates for On this day. Calendar clamping comes from
   epochDayMonthsAgo; the journal bounds how far annual checks reach.
   Good-day and mute decisions belong to the journal and consent layer. */

import { epochDayMonthsAgo } from './epochDay';

export type OnThisDayLookback = 'month' | 'sixMonths' | 'year' | `year-${number}`;

/** Longest first, the order the retrospective page shows them in when more
    than one qualifies. */
/* ON_THIS_DAY_LOOKBACKS stays exported only for its own test. */
export const ON_THIS_DAY_LOOKBACKS: { key: OnThisDayLookback; months: number }[] = [
  { key: 'year', months: 12 },
  { key: 'sixMonths', months: 6 },
  { key: 'month', months: 1 }
];

interface OnThisDayCandidate {
  key: OnThisDayLookback;
  epochDay: number;
  years?: number;
}

/** Whether a lookback day is worth showing: a good day, or one that carries
    a letter. The Home card and the block it opens both ask, so they cannot
    disagree about which days there are. */
export function onThisDayQualifies(good: boolean, dayLetters: readonly unknown[]): boolean {
  return good || dayLetters.length > 0;
}

/** Month, six months and annual anniversaries through the earliest journal day. */
export function onThisDayCandidates(todayEpochDay: number, earliestEpochDay?: number): OnThisDayCandidate[] {
  const older: OnThisDayCandidate[] = [];
  if (earliestEpochDay !== undefined) {
    for (let years = 2; ; years++) {
      const epochDay = epochDayMonthsAgo(todayEpochDay, years * 12);
      if (epochDay < earliestEpochDay) break;
      older.push({ key: `year-${years}`, epochDay, years });
    }
    older.reverse();
  }
  return [...older, ...ON_THIS_DAY_LOOKBACKS.map(({ key, months }) => ({
    key,
    epochDay: epochDayMonthsAgo(todayEpochDay, months)
  }))];
}
