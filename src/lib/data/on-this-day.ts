/* Which past days on-this-day checks today (phase 4 features ticket 03).

   Three lookback points - a month, six months and a year ago - each a
   calendar-arithmetic answer over `todayEpochDay`, kept here rather than in
   a screen for the same reason wrapped.ts is: the awkward edges are
   calendar rules, not something that needs a browser to work out.

   Whether a candidate day is worth resurfacing - CONTEXT.md's "good day" -
   is a journal read (mood, tags), not calendar arithmetic, so it lives on
   StatsArea.isGoodDay instead of here. This file only says which epoch days
   to ask about; each is checked against that rule independently, and
   nothing here decides which (if any) qualify. */

import { epochDayMonthsAgo } from './epochDay';

export type OnThisDayLookback = 'month' | 'sixMonths' | 'year';

/** Longest first, the order the retrospective page shows them in when more
    than one qualifies. */
export const ON_THIS_DAY_LOOKBACKS: { key: OnThisDayLookback; months: number }[] = [
  { key: 'year', months: 12 },
  { key: 'sixMonths', months: 6 },
  { key: 'month', months: 1 }
];

export interface OnThisDayCandidate {
  key: OnThisDayLookback;
  epochDay: number;
}

/** The three days on-this-day checks today. */
export function onThisDayCandidates(todayEpochDay: number): OnThisDayCandidate[] {
  return ON_THIS_DAY_LOOKBACKS.map(({ key, months }) => ({
    key,
    epochDay: epochDayMonthsAgo(todayEpochDay, months)
  }));
}
