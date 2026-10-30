/* Which reminders a dose schedule stands for (functional audit ticket 21,
   CONTEXT: "Dose reminder"). Pure, and kept above the journal seam beside
   doseSchedule.ts: what rule a rhythm becomes, and which existing reminder
   is about which drug, are questions about values rather than rows.

   A schedule's reminder times are not stored on the schedule. They live on
   the reminders themselves, each marked `dose:<episodeId>` (autoSource.ts),
   so the reminders the Android scheduler already reads are the only copy:
   nothing has to be kept in step with a second list of times. The rhythm
   comes from the schedule every time it is written. */

import { sameDrug } from './regimenEpisode';
import { weekdayOfEpochDay } from './epochDay';
import type { DoseScheduleRecurrence, Reminder } from './types';

/** The repeating half of a reminder's rule (reminderRule.ts): a dose
    reminder is never a one-off. */
export interface DoseReminderRule {
  time: string;
  recurrence: 'DAILY' | 'EVERY_N_DAYS';
  interval: number | null;
  anchorEpochDay: number | null;
}

const DAILY = (time: string): DoseReminderRule => ({ time, recurrence: 'DAILY', interval: null, anchorEpochDay: null });

/** One rule per time, or per time and weekday.

    Every-N-days counts from the episode's start, the same anchor the
    expected slots use (doseSchedule.ts), so a reminder rings on the days a
    dose is expected. A reminder has no weekday rule since the WEEKLY branch
    went (functional audit ticket 08), so each chosen weekday is its own
    every-7-days rule anchored on the first such day from the start; all
    seven is simply daily. */
export function doseReminderRules(
  recurrence: DoseScheduleRecurrence,
  startEpochDay: number,
  times: readonly string[]
): DoseReminderRule[] {
  if (recurrence.kind === 'everyNDays') {
    if (recurrence.everyNDays === 1) return times.map(DAILY);
    return times.map((time) => ({ time, recurrence: 'EVERY_N_DAYS', interval: recurrence.everyNDays, anchorEpochDay: startEpochDay }));
  }
  const weekdays = [...new Set(recurrence.weekdays)].sort((a, b) => a - b);
  if (weekdays.length === 7) return times.map(DAILY);
  return times.flatMap((time) =>
    weekdays.map((weekday) => ({
      time,
      recurrence: 'EVERY_N_DAYS' as const,
      interval: 7,
      anchorEpochDay: startEpochDay + ((weekday - weekdayOfEpochDay(startEpochDay) + 7) % 7)
    }))
  );
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Where a new schedule's reminders start: one dose at nine, more spread
    evenly from eight in the morning to eight in the evening, on the half
    hour. Only a starting point - the person sets each one. */
export function defaultReminderTimes(count: number): string[] {
  if (!Number.isSafeInteger(count) || count < 1) return [];
  if (count === 1) return ['09:00'];
  return Array.from({ length: count }, (_, index) => {
    const halfHours = Math.round(16 + (index * 24) / (count - 1));
    return `${pad(Math.floor(halfHours / 2))}:${halfHours % 2 ? '30' : '00'}`;
  });
}

/** The editor's list of times, one per dose a day, as the count changes:
    the times already chosen stay, the rest come from the defaults. A count
    that is not a number yet (a field being typed into) changes nothing. */
export function resizeReminderTimes(times: readonly string[], count: number): string[] {
  if (!Number.isSafeInteger(count) || count < 1) return [...times];
  const defaults = defaultReminderTimes(count);
  return Array.from({ length: count }, (_, index) => times[index] ?? defaults[index]);
}

/** The times a set of reminders rings at, once each and in order. A
    weekday schedule has one row per time and weekday, so this is how the
    schedule editor reads back the times it wrote. */
export function reminderTimesOf(reminders: readonly Pick<Reminder, 'time'>[]): string[] {
  return [...new Set(reminders.map((reminder) => reminder.time))].sort();
}

/** Whether a reminder the person made themselves is about this drug: it
    names the drug (functional audit ticket 20's picker), or names none and
    is titled with the drug's name and nothing else, which is how one was
    written before reminders could name a drug. These are what a schedule's
    first reminders replace, so nothing rings twice for one dose. A title
    that merely contains the name ("Progesterone refill") is left alone. */
export function isHandMadeReminderFor(reminder: Reminder, drug: string): boolean {
  if (reminder.autoSource !== null) return false;
  if (reminder.drug !== null) return sameDrug(reminder.drug, drug);
  return sameDrug(reminder.title, drug);
}
