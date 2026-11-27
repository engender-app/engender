/* Keeping a schedule's reminders in step with it. The rules come from doseReminders.ts;
   this is the write: read what each running episode's schedule asks for, read the reminders
   marked as derived from it, and change only the difference.

   Never opens a transaction of its own. Every caller already holds one (a schedule save, an
   episode edit, the boot pass), and a nested transaction waits behind its own caller
   forever (transactor.ts). Reads the tables directly rather than through the regimen and
   doses areas, both of which call in here. */

import { DOSE_PREFIX, doseAutoSource } from '../autoSource';
import { doseReminderRules, isHandMadeReminderFor, reminderTimesOf, type DoseReminderRule } from '../doseReminders';
import type { SqliteDriver } from '../sqlite/driver';
import type { DoseScheduleRecurrence, Reminder } from '../types';
import { makeRemindersArea } from './reminders';

/** A schedule save that says which times its reminders ring at: a list (empty
    for none) for the episode named. Any other write keeps each episode's
    times as they are and only carries the rhythm, drug and start through. */
export interface DoseReminderTimes {
  episodeId: string;
  times: readonly string[];
}

interface ScheduledEpisode {
  drug: string;
  startEpochDay: number;
  endEpochDay: number | null;
  recurrence: DoseScheduleRecurrence;
}

async function scheduledEpisodes(driver: SqliteDriver): Promise<Map<string, ScheduledEpisode>> {
  const [rows, weekdays] = await Promise.all([
    driver.query<{
      schedule_id: number;
      uuid: string;
      drug: string;
      start_epoch_day: number;
      end_epoch_day: number | null;
      recurrence_kind: string;
      every_n_days: number | null;
    }>(
      `SELECT s.id AS schedule_id, e.uuid, e.drug, e.start_epoch_day, e.end_epoch_day, s.recurrence_kind, s.every_n_days
         FROM dose_schedule s JOIN regimen_episode e ON e.id = s.episode_id
        WHERE e.hidden = 0`
    ),
    driver.query<{ schedule_id: number; weekday: number }>('SELECT schedule_id, weekday FROM dose_schedule_weekday')
  ]);
  return new Map(
    rows.map((row) => [
      row.uuid,
      {
        drug: row.drug,
        startEpochDay: row.start_epoch_day,
        endEpochDay: row.end_epoch_day,
        recurrence:
          row.recurrence_kind === 'weekdays'
            ? { kind: 'weekdays', weekdays: weekdays.filter((w) => w.schedule_id === row.schedule_id).map((w) => w.weekday) }
            : { kind: 'everyNDays', everyNDays: row.every_n_days as number }
      }
    ])
  );
}

const ruleKey = (rule: Pick<Reminder, 'time' | 'recurrence' | 'interval' | 'anchorEpochDay'>) => `${rule.time}|${rule.recurrence}|${rule.interval}|${rule.anchorEpochDay}`;

/** Brings every dose-derived reminder in line with its schedule, and
    answers whether anything was written.

    An episode's reminders go once it is hidden, has no schedule, or has
    ended on or before `todayEpochDay` - an end day is the last day of the
    course, and the person who ends one today has taken the last dose. An
    end day still ahead keeps them until it comes, which is why the boot
    pass calls this too. They do not come back if the episode is reopened:
    the times went with them, and the schedule's switch is the way back.

    A row is updated in place wherever it can be, a matching rule first,
    so a reminder keeps its id (a notification tap kept while locked names
    it) and its own switch: one the person turned off in the list stays off
    through a rhythm change. */
export async function syncDoseReminders(
  driver: SqliteDriver,
  todayEpochDay: number,
  set?: DoseReminderTimes
): Promise<boolean> {
  const reminders = makeRemindersArea(driver);
  const [episodes, all] = await Promise.all([scheduledEpisodes(driver), reminders.getReminders()]);

  const derived = new Map<string, Reminder[]>();
  for (const reminder of all) {
    if (!reminder.autoSource?.startsWith(DOSE_PREFIX)) continue;
    const episodeId = reminder.autoSource.slice(DOSE_PREFIX.length);
    derived.set(episodeId, [...(derived.get(episodeId) ?? []), reminder]);
  }

  const episodeIds = new Set([...derived.keys(), ...(set ? [set.episodeId] : [])]);
  let wrote = false;

  for (const episodeId of episodeIds) {
    const current = derived.get(episodeId) ?? [];
    const episode = episodes.get(episodeId);
    const running = episode !== undefined && (episode.endEpochDay === null || episode.endEpochDay > todayEpochDay);
    const times = set?.episodeId === episodeId ? set.times : reminderTimesOf(current);
    const desired = running ? doseReminderRules(episode.recurrence, episode.startEpochDay, times) : [];

    /* A schedule's first reminders replace the person's own reminders for the same drug, so
       one dose does not ring twice. Only then: a reminder made by hand after the schedule
       already has its own is the person's business. */
    if (running && set?.episodeId === episodeId && desired.length > 0 && current.length === 0) {
      for (const reminder of all) {
        if (!isHandMadeReminderFor(reminder, episode.drug)) continue;
        await reminders.deleteReminder(reminder.id);
        wrote = true;
      }
    }

    const unmatched = [...current];
    const pending: DoseReminderRule[] = [];
    const updates: Array<{ row: Reminder; rule: DoseReminderRule }> = [];
    for (const rule of desired) {
      const index = unmatched.findIndex((row) => ruleKey(row) === ruleKey(rule));
      if (index === -1) pending.push(rule);
      else updates.push({ row: unmatched.splice(index, 1)[0], rule });
    }
    for (const rule of pending) {
      const row = unmatched.shift();
      if (row) updates.push({ row, rule });
      else {
        await reminders.upsertReminder({
          title: episode!.drug,
          ...rule,
          epochDay: null,
          enabled: true,
          autoSource: doseAutoSource(episodeId),
          drug: episode!.drug
        });
        wrote = true;
      }
    }
    for (const { row, rule } of updates) {
      if (ruleKey(row) === ruleKey(rule) && row.title === episode!.drug && row.drug === episode!.drug) continue;
      await reminders.upsertReminder({ ...row, ...rule, epochDay: null, title: episode!.drug, drug: episode!.drug });
      wrote = true;
    }
    for (const row of unmatched) {
      await reminders.deleteReminder(row.id);
      wrote = true;
    }
  }
  return wrote;
}
