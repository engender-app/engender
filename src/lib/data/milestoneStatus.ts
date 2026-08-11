/* How a milestone reads against a given day: counting down to it, landing
   on it, or looking back at it (PRD F6/F26).

   Nothing here is stored (ADR-0010) - the schema has no `kind` column, and
   whether a day is a countdown or an anniversary is a question about today,
   which changes overnight. It also sits above the journal rather than in it,
   for the reason ticket 10 gives about the streak: "today" is a local
   calendar day (ADR-0001) and the data layer has no business deciding which
   one it is. So today arrives as an argument, and every case here is a plain
   fixture.

   Four screens asked this question before and one of them answered it
   differently (settings/milestones grew its own copy of the wording); the
   wording still belongs to the screens, but the arithmetic is here. */

import { anniversaryYears, nextAnniversaryEpochDay } from './epochDay';
import type { Milestone } from './types';

export interface MilestoneStatus {
  type: 'countdown' | 'today' | 'anniversary';
  days?: number;
  years?: number;
  inDays?: number;
  isAnnivToday?: boolean;
}

export function milestoneStatus(milestone: Pick<Milestone, 'epochDay'>, todayEpochDay: number): MilestoneStatus {
  if (milestone.epochDay > todayEpochDay) return { type: 'countdown', days: milestone.epochDay - todayEpochDay };
  if (milestone.epochDay === todayEpochDay) return { type: 'today', days: 0 };
  // Years counted from the anniversary rather than measured off the gap, so a
  // 29 February milestone does not read "0 years" on the day it flags as its
  // first (ticket 10).
  const years = anniversaryYears(milestone.epochDay, todayEpochDay);
  const nextAnniversary = nextAnniversaryEpochDay(milestone.epochDay, todayEpochDay);
  return {
    type: 'anniversary',
    years,
    inDays: nextAnniversary - todayEpochDay,
    isAnnivToday: nextAnniversary === todayEpochDay
  };
}

/** Every milestone with its status, soonest first: a countdown by how far
    off it is, a past one by how far off its next anniversary is. Both
    measures are "days from today", which is what makes one order out of
    two kinds of milestone. */
export function upcomingMilestones(
  milestones: Milestone[],
  todayEpochDay: number
): { m: Milestone; s: MilestoneStatus }[] {
  const daysAway = (s: MilestoneStatus) => (s.type === 'anniversary' ? (s.inDays ?? 0) : (s.days ?? 0));
  return milestones
    .map((m) => ({ m, s: milestoneStatus(m, todayEpochDay) }))
    .sort((a, b) => daysAway(a.s) - daysAway(b.s));
}
