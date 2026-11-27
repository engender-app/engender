/* The daily check-in's rule. Fires once a day at a wall-clock time, skips a day that
   already has an entry, and stays silent through `pausedThroughEpochDay` when the person
   paused it: the day after is the first one it may fire on again.

   What schedules the alarm is ReminderPlanner.nextCheckIn in Java, which runs before any
   WebView exists and cannot import this file. This side answers the same question for the
   reminders screen, which says when a paused check-in comes back. The two are held to the
   same answers by src/lib/android/fixtures/check-in-rule.json, which both suites iterate
   (ADR-0028's shape, the one reminderRule.ts follows). Quiet hours are not applied here:
   QuietHours.java holds the delivery, and the screen names the day, not the minute it
   lands. */

import { epochDayFromLocalDate, timestampAtLocalTime } from '../data/epochDay';

export interface CheckInRule {
  enabled: boolean;
  /** Local wall-clock 'HH:MM'. */
  time: string;
  /** The last silent day, or null when the check-in is not paused. */
  pausedThroughEpochDay: number | null;
  /** The day of the latest entry, whose own check-in has nothing to ask. */
  latestEntryEpochDay: number | null;
}

/** Whether the check-in may fire on `day` at all. */
export function checkInAllowedOn(rule: Pick<CheckInRule, 'enabled' | 'pausedThroughEpochDay'>, day: number): boolean {
  return rule.enabled && (rule.pausedThroughEpochDay === null || day > rule.pausedThroughEpochDay);
}

/** When the check-in fires next, strictly after `now`, or null when it is
    switched off. */
export function nextCheckIn(rule: CheckInRule, now: Date): Date | null {
  if (!rule.enabled) return null;
  let day = epochDayFromLocalDate(now);
  if (rule.pausedThroughEpochDay !== null && day <= rule.pausedThroughEpochDay) day = rule.pausedThroughEpochDay + 1;
  for (;;) {
    const at = new Date(timestampAtLocalTime(day, rule.time));
    if (at > now && day !== rule.latestEntryEpochDay) return at;
    day += 1;
  }
}
