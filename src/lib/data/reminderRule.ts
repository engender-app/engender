/* The reminder rule (ADR-0010, CONTEXT: "Reminder"): a local wall-clock
   time plus either a recurrence (DAILY / WEEKLY need nothing else,
   EVERY_N_DAYS carries its interval and an anchor day) or a concrete epoch
   day for a one-off. Never a stored next-fire instant - that would need
   rewriting after every fire, reboot and timezone change, and would shift
   a 20:00 reminder by an hour across a DST boundary.

   nextOccurrence() is the one function the editor's "Next: ..." preview
   and the notification scheduler share; that is the only way the two stay
   in agreement. */

import { epochDayFromLocalDate, localDateFromEpochDay } from './epochDay';

export type Recurrence = 'DAILY' | 'WEEKLY' | 'EVERY_N_DAYS';

export interface ReminderRule {
  /** Local wall-clock time, 'HH:MM'. */
  time: string;
  /** null means a one-off on `epochDay`. */
  recurrence: Recurrence | null;
  /** EVERY_N_DAYS only. */
  interval: number | null;
  /** EVERY_N_DAYS only: a day the reminder fires on, fixing the progression. */
  anchorEpochDay: number | null;
  /** One-off only: the concrete day. */
  epochDay: number | null;
}

/** The rule's occurrence on a given epoch day, as a local Date. */
function occurrenceOn(epochDay: number, time: string): Date {
  const [h, mi] = time.split(':').map(Number);
  const d = localDateFromEpochDay(epochDay);
  d.setHours(h, mi, 0, 0);
  return d;
}

/** When the rule fires next, strictly after `now` - except for a one-off,
    which is its own concrete moment whether or not it has passed; the
    caller decides what an elapsed one-off means. */
export function nextOccurrence(rule: ReminderRule, now: Date): Date {
  if (rule.recurrence === null) {
    if (rule.epochDay == null) throw new Error('one-off reminder has no epochDay');
    return occurrenceOn(rule.epochDay, rule.time);
  }

  const today = epochDayFromLocalDate(now);

  if (rule.recurrence === 'EVERY_N_DAYS') {
    if (rule.interval == null || rule.anchorEpochDay == null) {
      throw new Error('EVERY_N_DAYS reminder has no interval or anchor');
    }
    // The first progression day on or after today (the anchor itself when
    // it lies in the future), then one more interval if today's moment
    // already passed.
    const steps = Math.max(0, Math.ceil((today - rule.anchorEpochDay) / rule.interval));
    let day = rule.anchorEpochDay + steps * rule.interval;
    if (occurrenceOn(day, rule.time) <= now) day += rule.interval;
    return occurrenceOn(day, rule.time);
  }

  const step = rule.recurrence === 'WEEKLY' ? 7 : 1;
  const todayAt = occurrenceOn(today, rule.time);
  return todayAt > now ? todayAt : occurrenceOn(today + step, rule.time);
}
