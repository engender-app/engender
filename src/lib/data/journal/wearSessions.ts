/* The binder/tucking wear log (phase 5 ticket 04, CONTEXT: "Wear session").
   Two ways to reach the same row: a live start/stop timer - a running
   session is a row with a real start_timestamp and a null duration_ms - or
   a backfilled start day plus duration entered directly. Its own record
   type, not an Entry: no mood, dimension values, tags or note beyond its
   own free-text comfort/pain field.

   Its optional Reminder hook is reconciled here rather than at the UI seam,
   the same reason stock.ts owns its run-out reminder rather than leaving it
   to a screen: every save that can move a session's start time or reminder
   hours runs through the one function that decides what changes.

   Simpler than stock's reconcileStockReminder on purpose: a wear session's
   reminder has exactly one rule (a one-off, N hours after start) with
   nothing to recompute the way a moving run-out projection does, so there
   is no everCreated/dismissed bookkeeping here. The trade-off: if someone
   edits or deletes this session's auto reminder from the general reminders
   editor and then re-saves the session with its hours unchanged, a fresh
   reminder is recreated rather than staying cleared - a session is a
   one-time event a person is unlikely to keep re-saving after taking a
   reminder over by hand, which is why that gap is accepted rather than
   built around. */

import { epochDayFromLocalDate, startOfDayTimestamp } from '../epochDay';
import type { SqliteDriver } from '../sqlite/driver';
import type { Reminder, WearSession } from '../types';
import { assertChanged, mintUuid, now } from './support';
import type { RemindersArea } from './reminders';

export interface WearSessionInput {
  id?: string;
  startTimestamp: number;
  /** Null means the session is still running (live mode, not yet stopped). */
  durationMs: number | null;
  note?: string | null;
  /** Hours after `startTimestamp` to remind at, or null for no reminder.
      Reconciled against this session's own auto-managed Reminder on every
      write - passing null clears whatever reminder an earlier save
      created. Omit the field entirely to leave the reminder untouched. */
  reminderHoursAfterStart?: number | null;
  /** The reminder's title, used only the first time this session gets one -
      an update reuses whatever title is already on the row, the same way
      stock.ts's reconcile only sets a title on `create`. Required whenever
      `reminderHoursAfterStart` is non-null and no reminder exists yet: the
      alternative default would be this session's own auto_source marker,
      which is an id meant for matching rows, not a title meant to be read. */
  reminderTitle?: string;
}

export interface WearSessionsArea {
  /** Every session whose start falls on a day in `[fromEpochDay,
      toEpochDay]`, oldest first. */
  getSessions(fromEpochDay: number, toEpochDay: number): Promise<WearSession[]>;
  /** The one session with no duration yet, if any - a live timer someone
      started and has not stopped. At most one at a time: refusing to start
      a second while one is running is the UI's own call, not something
      this area arbitrates. */
  getRunningSession(): Promise<WearSession | null>;
  /** Returns the session's id. Updating an unknown id throws. */
  upsertSession(input: WearSessionInput): Promise<string>;
  /** Idempotent. Also clears this session's auto-managed reminder, if any. */
  deleteSession(id: string): Promise<void>;
}

type WearSessionRow = {
  uuid: string;
  start_timestamp: number;
  duration_ms: number | null;
  note: string | null;
};

const toWearSession = (row: WearSessionRow): WearSession => ({
  id: row.uuid,
  startTimestamp: row.start_timestamp,
  durationMs: row.duration_ms,
  note: row.note
});

/** Whole hours and minutes out of a millisecond span. */
export function hoursMinutesOf(ms: number): { hours: number; minutes: number } {
  const totalMinutes = Math.max(0, Math.floor(ms / 60000));
  return { hours: Math.floor(totalMinutes / 60), minutes: totalMinutes % 60 };
}

/** Whole hours, minutes and seconds out of a millisecond span. */
export function hoursMinutesSecondsOf(ms: number): { hours: number; minutes: number; seconds: number } {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return { hours, minutes, seconds };
}

/** Where this session's reminder marks which session it belongs to -
    `feature:id`, the same shape stock.ts's own `autoSourceFor` builds. Not
    exported: only this module writes one. */
const autoSourceFor = (sessionId: string): string => `wear:${sessionId}`;

/** A one-off Reminder rule for `hours` after `startTimestamp`, as the local
    epoch day and wall-clock time the schema's rule shape wants - a Reminder
    never stores a raw timestamp (reminderRule.ts). */
function ruleForHoursAfter(startTimestamp: number, hours: number): { epochDay: number; time: string } {
  const at = new Date(startTimestamp + hours * 3600000);
  return {
    epochDay: epochDayFromLocalDate(at),
    time: `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`
  };
}

export function makeWearSessionsArea(driver: SqliteDriver, reminders: RemindersArea): WearSessionsArea {
  const findAutoReminder = (all: readonly Reminder[], sessionId: string): Reminder | null =>
    all.find((reminder) => reminder.autoSource === autoSourceFor(sessionId)) ?? null;

  const reconcileReminder = async (
    sessionId: string,
    startTimestamp: number,
    hours: number | null | undefined,
    title: string | undefined
  ): Promise<void> => {
    if (hours === undefined) return;

    const existing = findAutoReminder(await reminders.getReminders(), sessionId);

    if (hours === null) {
      if (existing) await reminders.deleteReminder(existing.id);
      return;
    }

    if (!existing && title === undefined) {
      throw new Error(`wear session ${sessionId}: a new reminder needs a title`);
    }

    const rule = ruleForHoursAfter(startTimestamp, hours);
    await reminders.upsertReminder({
      id: existing?.id,
      title: existing?.title ?? (title as string),
      type: 'other',
      time: rule.time,
      recurrence: null,
      interval: null,
      anchorEpochDay: null,
      epochDay: rule.epochDay,
      enabled: existing?.enabled ?? true,
      autoSource: autoSourceFor(sessionId)
    });
  };

  return {
    async getSessions(fromEpochDay, toEpochDay) {
      const rows = await driver.query<WearSessionRow>(
        `SELECT uuid, start_timestamp, duration_ms, note FROM wear_session
          WHERE start_timestamp >= ? AND start_timestamp < ?
          ORDER BY start_timestamp, id`,
        [startOfDayTimestamp(fromEpochDay), startOfDayTimestamp(toEpochDay + 1)]
      );
      return rows.map(toWearSession);
    },

    async getRunningSession() {
      const rows = await driver.query<WearSessionRow>(
        'SELECT uuid, start_timestamp, duration_ms, note FROM wear_session WHERE duration_ms IS NULL ORDER BY start_timestamp DESC LIMIT 1'
      );
      return rows.length ? toWearSession(rows[0]) : null;
    },

    async upsertSession(input) {
      const note = input.note?.trim() || null;
      const values = [input.startTimestamp, input.durationMs, note, now()];

      let id = input.id;
      if (id) {
        const result = await driver.run(
          'UPDATE wear_session SET start_timestamp = ?, duration_ms = ?, note = ?, updated_at = ? WHERE uuid = ?',
          [...values, id]
        );
        assertChanged(result, `wear session: ${id}`);
      } else {
        id = mintUuid();
        await driver.run(
          'INSERT INTO wear_session (start_timestamp, duration_ms, note, updated_at, uuid) VALUES (?, ?, ?, ?, ?)',
          [...values, id]
        );
      }

      await reconcileReminder(id, input.startTimestamp, input.reminderHoursAfterStart, input.reminderTitle);
      return id;
    },

    async deleteSession(id) {
      const result = await driver.run('DELETE FROM wear_session WHERE uuid = ?', [id]);
      assertChanged(result, `wear session: ${id}`);

      const existing = findAutoReminder(await reminders.getReminders(), id);
      if (existing) await reminders.deleteReminder(existing.id);
    }
  };
}
