/* ReminderRepository (PRD F11/F23) — demo implementation; the Android build
   adds Capacitor Local Notifications scheduling behind the same calls.

   Stores the rule from reminderRule.ts, never a next instant (ADR-0010),
   and validates it the way the schema's recurrence CHECK does - the old
   demo vocabulary ('EVERY_3_DAYS', onceInDays) is a hard failure there,
   not a mapping detail. The schedule wording lives in the i18n layer
   (vocabulary/reminderLabel.ts), not here: this module stays free of
   paraglide so the same rules run in the Node tier (ADR-0016). */

import { db, save } from '../db.svelte';
import { assertValidRule } from '../reminderRule';
import type { Reminder } from '../types';

export type ReminderInput = Omit<Reminder, 'id'> & { id?: string };

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

export function setReminderEnabled(id: string, enabled: boolean) {
  const r = db.reminders.find((x) => x.id === id);
  if (!r) throw new Error(`unknown reminder: ${id}`);
  r.enabled = enabled;
  save();
}
