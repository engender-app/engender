/* The reminders area (PRD F11/F23). Stores the rule from reminderRule.ts,
   never a next-fire instant (ADR-0010). The rule is validated before the
   write and the schema's recurrence CHECK backs it up - the old demo
   vocabulary ('EVERY_3_DAYS') was a hard failure there, not a mapping
   detail. */

import { assertValidRule } from '../reminderRule';
import type { SqliteDriver } from '../sqlite/driver';
import type { Reminder } from '../types';
import { assertChanged, bool, mintUuid, now } from './support';

/** `autoSource` defaults to null: every ordinary save - the reminders
    editor never sets it - clears whichever feature's marker a reminder
    carried, which is the handoff stock.ts's auto-managed run-out prompt
    relies on (stockReminder.ts). Only stock.ts's own writes pass one. */
export type ReminderInput = Omit<Reminder, 'id' | 'autoSource'> & { id?: string; autoSource?: string | null };

export interface RemindersArea {
  getReminders(): Promise<Reminder[]>;
  /** Returns the reminder's id. Updating an unknown id throws; an invalid
      rule throws before anything is written. */
  upsertReminder(input: ReminderInput): Promise<string>;
  /** Idempotent. */
  deleteReminder(id: string): Promise<void>;
  setEnabled(id: string, enabled: boolean): Promise<void>;
}

export function makeRemindersArea(driver: SqliteDriver): RemindersArea {
  return {
    async getReminders() {
      const rows = await driver.query<{
        uuid: string;
        title: string;
        type: Reminder['type'];
        time: string;
        recurrence: Reminder['recurrence'];
        interval: number | null;
        anchor_epoch_day: number | null;
        epoch_day: number | null;
        enabled: number;
        auto_source: string | null;
      }>(
        'SELECT uuid, title, type, time, recurrence, interval, anchor_epoch_day, epoch_day, enabled, auto_source FROM reminder ORDER BY id'
      );
      return rows.map((r) => ({
        id: r.uuid,
        title: r.title,
        type: r.type,
        time: r.time,
        recurrence: r.recurrence,
        interval: r.interval,
        anchorEpochDay: r.anchor_epoch_day,
        epochDay: r.epoch_day,
        enabled: bool(r.enabled),
        autoSource: r.auto_source
      }));
    },

    async upsertReminder(input) {
      assertValidRule(input);
      const autoSource = input.autoSource ?? null;
      if (input.id) {
        const result = await driver.run(
          `UPDATE reminder SET title = ?, type = ?, time = ?, recurrence = ?, interval = ?, anchor_epoch_day = ?,
             epoch_day = ?, enabled = ?, auto_source = ?, updated_at = ? WHERE uuid = ?`,
          [
            input.title,
            input.type,
            input.time,
            input.recurrence,
            input.interval,
            input.anchorEpochDay,
            input.epochDay,
            input.enabled ? 1 : 0,
            autoSource,
            now(),
            input.id
          ]
        );
        assertChanged(result, `reminder: ${input.id}`);
        return input.id;
      }
      const uuid = mintUuid();
      await driver.run(
        `INSERT INTO reminder (uuid, title, type, time, recurrence, interval, anchor_epoch_day, epoch_day, enabled, auto_source, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          uuid,
          input.title,
          input.type,
          input.time,
          input.recurrence,
          input.interval,
          input.anchorEpochDay,
          input.epochDay,
          input.enabled ? 1 : 0,
          autoSource,
          now()
        ]
      );
      return uuid;
    },

    async deleteReminder(id) {
      await driver.run('DELETE FROM reminder WHERE uuid = ?', [id]);
    },

    async setEnabled(id, enabled) {
      const result = await driver.run('UPDATE reminder SET enabled = ?, updated_at = ? WHERE uuid = ?', [
        enabled ? 1 : 0,
        now(),
        id
      ]);
      assertChanged(result, `reminder: ${id}`);
    }
  };
}
