/* ReminderRepository (PRD F11/F23) — demo implementation; the Android build
   adds Capacitor Local Notifications scheduling behind the same calls.

   Stores the rule from reminderRule.ts, never a next instant (ADR-0010),
   and validates it the way the schema's recurrence CHECK does - the old
   demo vocabulary ('EVERY_3_DAYS', onceInDays) is a hard failure there,
   not a mapping detail. The schedule wording lives in the i18n layer
   (vocabulary/reminderLabel.ts), not here: this module stays free of
   paraglide so the same rules run in the Node tier (ADR-0016). */

import { db, save } from '../db.svelte';
import type { Reminder } from '../types';

export type ReminderInput = Omit<Reminder, 'id'> & { id?: string };

/** The same three-way shape the schema CHECK enforces: a one-off day, an
    anchored EVERY_N_DAYS, or a bare DAILY/WEEKLY - nothing in between. */
export function assertValidRule(r: ReminderInput) {
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

export function getReminders(): Reminder[] {
  return db.reminders;
}

export function upsertReminder(r: ReminderInput) {
  assertValidRule(r);
  if (r.id) {
    const i = db.reminders.findIndex((x) => x.id === r.id);
    if (i < 0) throw new Error(`unknown reminder: ${r.id}`);
    db.reminders[i] = { ...r, id: r.id };
  } else {
    db.reminders.push({ ...r, id: crypto.randomUUID() });
  }
  save();
}

export function deleteReminder(id: string) {
  db.reminders = db.reminders.filter((r) => r.id !== id);
  save();
}

export function setReminderEnabled(id: string, enabled: boolean) {
  const r = db.reminders.find((x) => x.id === id);
  if (!r) throw new Error(`unknown reminder: ${id}`);
  r.enabled = enabled;
  save();
}
