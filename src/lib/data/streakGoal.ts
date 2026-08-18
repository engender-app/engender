/* Streak goals and gentle achievements (phase 4 features ticket 17,
   CONTEXT: "Streak", "Best streak"). A goal is a target streak length
   chosen for a habit; progress towards it and the achievement ladder below
   both read the journal's existing streak numbers (journal/stats.ts)
   rather than a second counting mechanism that could disagree with them.

   Journaling frequency is the only habit wired up so far.
   `StreakGoalHabit` is a union of one member on purpose: voice practice
   (phase 4 features tickets 21/24-25) is named in the ticket as a second
   habit, but ticket 24 hasn't shipped the recording data a "voice practice
   happened on day X" question would read - see the comment ticket 24 now
   carries about adding a 'voice' case here once it has. */

export type StreakGoalHabit = 'journaling';

/** Streak lengths a gentle achievement calls out, in days. Not a reward
    ladder that can be lost: each length reachedMilestones() reports is
    read off the longest streak ever recorded, not the live one, so a rung
    earned once stays earned through a later gap (CONTEXT: Streak -
    "backdating an entry into a gap repairs it" already treats a gap as
    recoverable rather than a failure, and a badge taken back on a missed
    day would contradict that). */
export const GOAL_MILESTONE_DAYS = [3, 7, 14, 30, 60, 100, 180, 365] as const;

/** Target lengths offered when setting a goal - a short list to choose
    from rather than the whole achievement ladder, which is a chart to look
    at, not a picker to scroll through. Every value is also a
    GOAL_MILESTONE_DAYS rung, so hitting the target is itself the first
    achievement it lights up. */
export const GOAL_TARGET_PRESETS = [7, 14, 30, 60] as const;

export interface GoalProgress {
  targetDays: number;
  currentStreak: number;
  /** 0 to 1. Capped at 1 once the streak reaches the target - there is no
      "110%" to show, only met or not yet. */
  fraction: number;
  met: boolean;
}

export function goalProgress(currentStreak: number, targetDays: number): GoalProgress {
  return {
    targetDays,
    currentStreak,
    fraction: Math.min(1, currentStreak / targetDays),
    met: currentStreak >= targetDays
  };
}

/** Which rungs of GOAL_MILESTONE_DAYS the longest streak on record has ever
    reached. */
export function reachedMilestones(bestStreakEver: number): number[] {
  return GOAL_MILESTONE_DAYS.filter((days) => bestStreakEver >= days);
}
