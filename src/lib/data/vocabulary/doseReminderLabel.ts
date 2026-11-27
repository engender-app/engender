/* What a medication reminder says it is reminding about. The reminders list and the
   notification both read it here, so the two never word one reminder differently.

   Worked out when shown, never stored. A reminder's stored title stays the drug's name,
   because that is what the schedule sync compares and what a schedule's first save matches
   a hand-made reminder by (doseReminders.ts); and these words speak paraglide, so a stored
   copy would keep whichever language it was written in. */

import { m } from '$lib/paraglide/messages';
import { fmtNumber } from '$lib/data/dates';
import { DOSE_PREFIX } from '../autoSource';
import { matchDoseRoute } from '../doseSchedule';
import { reminderTimesOf } from '../doseReminders';
import { sameDrug } from '../regimenEpisode';
import { spanCoversDay } from '../span';
import type { DoseSchedule, DoseScheduleAmount, RegimenEpisode, Reminder } from '../types';
import { ROUTE_OPTIONS, routeLabel } from './doseLabels';

export interface ReminderWordsContext {
  /** Every reminder: a schedule's other reminders say which dose of the day
      this one is. */
  reminders: readonly Reminder[];
  episodes: readonly RegimenEpisode[];
  schedules: readonly DoseSchedule[];
  todayEpochDay: number;
}

export interface ReminderWords {
  title: string;
  /** The second line, or null when the title already says everything. */
  detail: string | null;
}

/** The amount every dose at `index` of the day gets, or null when the
    schedule's cycle gives that dose different amounts on different days.
    `index` is null for a reminder that is not one of a schedule's own, and
    then every amount in the cycle has to agree. */
function fixedAmount(episode: RegimenEpisode, schedule: DoseSchedule | undefined, index: number | null): DoseScheduleAmount | null {
  const amounts = schedule?.doseAmounts;
  if (!schedule || !amounts || amounts.length === 0) return { dose: episode.dose, doseUnit: episode.doseUnit };
  const perDay = Math.max(1, schedule.dosesPerDay);
  const seen =
    index === null
      ? amounts
      : Array.from({ length: amounts.length }, (_, occurrence) => amounts[(occurrence * perDay + index) % amounts.length]);
  const [first] = seen;
  return seen.every((amount) => amount.dose === first.dose && amount.doseUnit === first.doseUnit) ? first : null;
}

/** The app's own word for the route, lower case because it follows a comma,
    or the person's own text where it names no route the app knows. */
function routeWords(route: string): string {
  const known = matchDoseRoute(route, ROUTE_OPTIONS);
  return known ? routeLabel(known).toLocaleLowerCase() : route.trim();
}

/** "Estradiol valerate 4 mg, intramuscular": the drug, then the amount and
    the route where they are known. */
function doseWords(episode: RegimenEpisode, amount: DoseScheduleAmount | null): string {
  const what = amount ? `${episode.drug} ${fmtNumber(amount.dose)} ${amount.doseUnit}` : episode.drug;
  const route = routeWords(episode.route);
  return route ? `${what}, ${route}` : what;
}

/** The episode a reminder is about: its schedule's, for a reminder the
    schedule made, or else the one regimen for its drug running today. Two
    running for the same drug is the person's call (as FA 20's Taken is), so
    neither is guessed at. */
function episodeOf(reminder: Reminder, context: ReminderWordsContext): RegimenEpisode | null {
  if (reminder.autoSource?.startsWith(DOSE_PREFIX)) {
    const id = reminder.autoSource.slice(DOSE_PREFIX.length);
    return context.episodes.find((episode) => episode.id === id) ?? null;
  }
  const drug = reminder.drug as string;
  const running = context.episodes.filter((episode) => sameDrug(episode.drug, drug) && spanCoversDay(episode, context.todayEpochDay));
  return running.length === 1 ? running[0] : null;
}

export function describeReminder(reminder: Reminder, context: ReminderWordsContext): ReminderWords {
  if (!reminder.drug) return { title: reminder.title, detail: null };

  const episode = episodeOf(reminder, context);
  let what = reminder.drug;
  let ordinal: string | null = null;
  if (episode) {
    const schedule = context.schedules.find((s) => s.episodeId === episode.id);
    let index: number | null = null;
    if (reminder.autoSource?.startsWith(DOSE_PREFIX)) {
      const times = reminderTimesOf(context.reminders.filter((r) => r.autoSource === reminder.autoSource));
      if (times.length > 1) {
        index = times.indexOf(reminder.time);
        ordinal = m.rem_dose_of_day({ index: index + 1, count: times.length });
      }
      // Amounts set per dose of the day follow the times only when there
      // is one time per dose; otherwise the cycle as a whole has to agree.
      if (schedule && times.length !== schedule.dosesPerDay) index = null;
      else index ??= 0;
    }
    what = doseWords(episode, fixedAmount(episode, schedule, index));
  }

  // A name that is only the drug's says nothing the description does not.
  const title = sameDrug(reminder.title, reminder.drug) ? what : reminder.title;
  const detail = [title === what ? null : what, ordinal].filter(Boolean).join(' · ');
  return { title, detail: detail || null };
}

/** The notification's title and text. The time stays in the text, as it
    always has; hiding sensitive titles keeps only the time (ReminderAlarmReceiver). */
export function reminderNotification(reminder: Reminder, context: ReminderWordsContext): { title: string; text: string } {
  const { title, detail } = describeReminder(reminder, context);
  return { title, text: detail ? `${detail} · ${reminder.time}` : reminder.time };
}
