/* The wear log (phase 5 ticket 04, CONTEXT: "Wear session"). Two ways to
   reach the same row: a live start/stop timer - a running session is a row
   with a real start_timestamp and a null duration_ms - or a backfilled
   start day plus duration entered directly. Its own record type, not an
   Entry: no mood, dimension values, tags or note beyond its own free-text
   comfort/pain field.

   Every row says which practice it was (`kind`, schema v71, phase 8
   features ticket 50). Everything downstream reads it: the screen's whole
   wording, which body region the trend defaults to, and whether the eight-
   hour duration cue below can apply at all.

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

import { epochDayFromLocalDate, epochDayFromTimestamp, startOfDayTimestamp } from '../epochDay';
import type { SqliteDriver } from '../sqlite/driver';
import type { Reminder, WearKind, WearSession } from '../types';
import { assertChanged, mintUuid, now } from './support';
import type { RemindersArea } from './reminders';
import { wearAutoSource } from '../autoSource';

export interface WearSessionInput {
  id?: string;
  /** Required on every write, not just a create (ticket 50): every caller
      that updates a session is holding the row it read, so asking for the
      kind back costs nothing and keeps the column out of the "sometimes
      set" category a partial update would put it in. */
  kind: WearKind;
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
  /** The kind of the most recently started session, or null with nothing
      logged. What a screen with no kind to hand opens on (ticket 50): the
      wear sheet's blank draft, and quick add's one-tap start, which has no
      picker to offer at all. */
  latestKind(): Promise<WearKind | null>;
  /** The day the most recent session started, at or before `todayEpochDay`,
      or null if there is none (phase 8 features ticket 03, lastWrite.ts).
      The table stores a `start_timestamp`, not an `epoch_day`, the same
      timestamp-bound reasoning doses.ts's own version gives. */
  lastWriteEpochDay(todayEpochDay: number): Promise<number | null>;
  /** Returns the session's id. Updating an unknown id throws. */
  upsertSession(input: WearSessionInput): Promise<string>;
  /** Idempotent. Also clears this session's auto-managed reminder, if any. */
  deleteSession(id: string): Promise<void>;
}

type WearSessionRow = {
  uuid: string;
  kind: string;
  start_timestamp: number;
  duration_ms: number | null;
  note: string | null;
};

const toWearSession = (row: WearSessionRow): WearSession => ({
  id: row.uuid,
  kind: row.kind as WearKind,
  startTimestamp: row.start_timestamp,
  durationMs: row.duration_ms,
  note: row.note
});

const SESSION_COLUMNS = 'uuid, kind, start_timestamp, duration_ms, note';

/** The three kinds, in the order a picker offers them. Typed against the
    union rather than deriving it, the same shape `EpisodeEndReason` and its
    label record have: the `Record<WearKind, ...>` maps in
    vocabulary/wearLabels.ts are what turn a forgotten kind into a
    typecheck failure. */
export const WEAR_KINDS: readonly WearKind[] = ['binder', 'tucking', 'compression'];

/** Which built-in body region the wear trend compares against by default,
    per kind (CONTEXT: "Wear session"). Built-in ids only - no new region
    vocabulary - and a default rather than a rule: the chart card's own
    region picker overrides it for any kind, exactly as it did before there
    were kinds. */
export const WEAR_KIND_REGION: Record<WearKind, string> = {
  binder: 'chest',
  tucking: 'genitals',
  compression: 'hips_waist'
};

/** How long a running binder session runs before it picks up the duration
    cue (ADR-0064).

    Eight hours is what four independent harm-reduction sources converge on
    - Point of Pride, Desert AIDS Project, the Rainbow Project and Trans
    Care BC (binder-tucking-safety-guidance-research.md) - and the copy that
    reads it says "commonly recommended" rather than a limit, because the
    one peer-reviewed source on the question (Peitzmeier et al. 2017) is
    explicit that the figure is community folk consensus and that its own
    correlational finding is about days per week, not hours per day.

    Binding only. Tucking's own eight-hour figure has two sources against
    binding's four and is already exceeded by 44.8% of daily tuckers (Malik
    et al. 2024), and no source of any kind gives a compression figure, so
    neither kind gets a threshold rather than getting a borrowed one. */
export const BINDER_CUE_HOURS = 8;

/** Whether this session is showing the duration cue right now. Running
    binder sessions only: a stopped session is a record of something already
    over, and there is nothing non-blocking to say about it after the fact. */
export function binderCueShowing(
  session: Pick<WearSession, 'kind' | 'startTimestamp' | 'durationMs'>,
  nowMs: number
): boolean {
  if (session.kind !== 'binder' || session.durationMs !== null) return false;
  return nowMs - session.startTimestamp >= BINDER_CUE_HOURS * 3600000;
}

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
    `feature:id`, the same shape stock.ts's own marker has. Both live in
    autoSource.ts now, since phase 6 ticket 04 gave the registry a switch
    that has to recognise this subset. */
const autoSourceFor = wearAutoSource;

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
        `SELECT ${SESSION_COLUMNS} FROM wear_session
          WHERE start_timestamp >= ? AND start_timestamp < ?
          ORDER BY start_timestamp, id`,
        [startOfDayTimestamp(fromEpochDay), startOfDayTimestamp(toEpochDay + 1)]
      );
      return rows.map(toWearSession);
    },

    async getRunningSession() {
      const rows = await driver.query<WearSessionRow>(
        `SELECT ${SESSION_COLUMNS} FROM wear_session WHERE duration_ms IS NULL ORDER BY start_timestamp DESC LIMIT 1`
      );
      return rows.length ? toWearSession(rows[0]) : null;
    },

    async latestKind() {
      const rows = await driver.query<{ kind: string }>(
        'SELECT kind FROM wear_session ORDER BY start_timestamp DESC, id DESC LIMIT 1'
      );
      return rows.length ? (rows[0].kind as WearKind) : null;
    },

    async lastWriteEpochDay(todayEpochDay) {
      const rows = await driver.query<{ ts: number | null }>(
        'SELECT MAX(start_timestamp) AS ts FROM wear_session WHERE start_timestamp < ?',
        [startOfDayTimestamp(todayEpochDay + 1)]
      );
      const ts = rows[0]?.ts;
      return ts == null ? null : epochDayFromTimestamp(ts);
    },

    async upsertSession(input) {
      const note = input.note?.trim() || null;
      const values = [input.kind, input.startTimestamp, input.durationMs, note, now()];

      let id = input.id;
      if (id) {
        const result = await driver.run(
          'UPDATE wear_session SET kind = ?, start_timestamp = ?, duration_ms = ?, note = ?, updated_at = ? WHERE uuid = ?',
          [...values, id]
        );
        assertChanged(result, `wear session: ${id}`);
      } else {
        id = mintUuid();
        await driver.run(
          'INSERT INTO wear_session (kind, start_timestamp, duration_ms, note, updated_at, uuid) VALUES (?, ?, ?, ?, ?, ?)',
          [...values, id]
        );
      }

      await reconcileReminder(id, input.startTimestamp, input.reminderHoursAfterStart, input.reminderTitle);
      return id;
    },

    async deleteSession(id) {
      await driver.run('DELETE FROM wear_session WHERE uuid = ?', [id]);

      const existing = findAutoReminder(await reminders.getReminders(), id);
      if (existing) await reminders.deleteReminder(existing.id);
    }
  };
}
