/* The reminder rule (ADR-0010, CONTEXT: "Reminder"): a local wall-clock
   time plus either a recurrence (DAILY / WEEKLY need nothing else,
   EVERY_N_DAYS carries its interval and an anchor day) or a concrete epoch
   day for a one-off. Never a stored next-fire instant - that would need
   rewriting after every fire, reboot and timezone change, and would shift
   a 20:00 reminder by an hour across a DST boundary.

   nextOccurrence() answers one question - when does this rule fire next,
   strictly after now - and the editor's "Next: ..." preview is its only
   caller. What decides when a notification actually fires is
   ReminderPlanner.nextReminder in Java, which cannot import this file and
   reimplements the same arithmetic. The two are held to the same answers by
   src/lib/android/fixtures/reminder-rule.json, which both suites iterate
   (ADR-0028's shape). Editing the rule here without adding the case there
   leaves the two free to drift, which is how they came to disagree about an
   elapsed one-off with both suites green. */

import { epochDayFromLocalDate, timestampAtLocalTime } from './epochDay';

type Recurrence = 'DAILY' | 'WEEKLY' | 'EVERY_N_DAYS';

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

/** The same three-way shape the schema's CHECK enforces: a one-off day, an
    anchored EVERY_N_DAYS, or a bare DAILY/WEEKLY - nothing in between.
    Validated before the row is written so a bad rule fails as one clear
    error rather than as a constraint violation from inside the driver. */
export function assertValidRule(r: ReminderRule) {
  const oneOff = r.recurrence === null && r.epochDay != null && r.interval == null && r.anchorEpochDay == null;
  const everyN =
    r.recurrence === 'EVERY_N_DAYS' && r.interval != null && r.anchorEpochDay != null && r.epochDay == null;
  const plain =
    (r.recurrence === 'DAILY' || r.recurrence === 'WEEKLY') &&
    r.interval == null &&
    r.anchorEpochDay == null &&
    r.epochDay == null;
  if (!oneOff && !everyN && !plain) {
    throw new Error(`invalid reminder rule: ${r.recurrence ?? 'one-off'}`);
  }
}

/** The rule's occurrence on a given epoch day, as a local Date. */
function occurrenceOn(epochDay: number, time: string): Date {
  return new Date(timestampAtLocalTime(epochDay, time));
}

/** When the rule fires next, strictly after `now`, or null when it never
    will again - which only a one-off whose day and time have gone by can be.
    A recurring rule always has a next one. */
export function nextOccurrence(rule: ReminderRule, now: Date): Date | null {
  if (rule.recurrence === null) {
    if (rule.epochDay == null) throw new Error('one-off reminder has no epochDay');
    const at = occurrenceOn(rule.epochDay, rule.time);
    return at > now ? at : null;
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

/* The editor's own vocabulary (F25). The segmented control offers five
   options where the stored rule has three shapes: a one-off, the two
   plain recurrences, and an anchored EVERY_N_DAYS split into the two
   intervals worth a button. The pair below is the whole of that
   translation, and it lived in settings/reminders/[id]/+page.svelte where
   nothing could run it.

   Here rather than in the screen for the reason the header above gives
   about the Java side: a rule this app writes and a rule the scheduler
   reads have to be the same rule, so everything that builds one belongs
   next to `assertValidRule` and to the fixture. */
export type RecurrenceChoice = 'ONCE' | 'DAILY' | 'EVERY_3_DAYS' | 'EVERY_7_DAYS' | 'WEEKLY';

const CHOICE_INTERVAL: Record<'EVERY_3_DAYS' | 'EVERY_7_DAYS', number> = { EVERY_3_DAYS: 3, EVERY_7_DAYS: 7 };

/** Which option a stored rule reads back as. An EVERY_N_DAYS interval the
    control does not offer - a stock reminder's, or an older journal's -
    reads back as the 3-day option rather than as no selection at all. */
export function choiceFromRule(rule: ReminderRule): RecurrenceChoice {
  if (rule.recurrence === null) return 'ONCE';
  if (rule.recurrence === 'EVERY_N_DAYS') return rule.interval === 7 ? 'EVERY_7_DAYS' : 'EVERY_3_DAYS';
  return rule.recurrence;
}

/** The rule an option writes back, against `now` and whatever rule was
    already stored.

    `existing` is only ever consulted for its anchor: an EVERY_N_DAYS rule
    keeps the progression it is already on when the interval is unchanged,
    because editing a reminder's title must not silently move which third
    day it fires on. Changing the interval starts a fresh one, since the
    old anchor would describe a different set of days than the person just
    asked for. */
export function ruleFromChoice(
  choice: RecurrenceChoice,
  time: string,
  existing: ReminderRule | null,
  now: Date
): ReminderRule {
  const none = { interval: null, anchorEpochDay: null, epochDay: null };
  if (choice === 'ONCE') {
    /* "Once" means the next moment the chosen time comes around, and
       nextOccurrence decides whether that is today or tomorrow. A DAILY
       rule always has one - only an elapsed one-off comes back empty - so
       this is the day the rule is dated from, and is why the editor's
       preview never has to say a saved one-off has passed. */
    const at = nextOccurrence({ ...none, time, recurrence: 'DAILY' }, now)!;
    return { ...none, time, recurrence: null, epochDay: epochDayFromLocalDate(at) };
  }
  if (choice === 'EVERY_3_DAYS' || choice === 'EVERY_7_DAYS') {
    const interval = CHOICE_INTERVAL[choice];
    const anchorEpochDay =
      existing?.recurrence === 'EVERY_N_DAYS' && existing.interval === interval
        ? existing.anchorEpochDay
        : epochDayFromLocalDate(now);
    return { ...none, time, recurrence: 'EVERY_N_DAYS', interval, anchorEpochDay };
  }
  return { ...none, time, recurrence: choice };
}
