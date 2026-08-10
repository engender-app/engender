/* ReminderRepository (PRD F11/F23) — demo implementation; the Android build
   adds Capacitor Local Notifications scheduling behind the same calls. */

import { db, save } from '../db.svelte';
import type { Reminder } from '../types';

export function upsertReminder(r: Partial<Reminder> & { title: string }) {
  if (r.id) {
    const i = db.reminders.findIndex((x) => x.id === r.id);
    if (i >= 0) db.reminders[i] = { ...db.reminders[i], ...r } as Reminder;
  } else {
    db.reminders.push({ type: 'other', time: '20:00', recurrence: null, enabled: true, ...r, id: 'r' + Date.now() } as Reminder);
  }
  save();
}

export function setReminderEnabled(id: string, enabled: boolean) {
  const r = db.reminders.find((x) => x.id === id);
  if (r) {
    r.enabled = enabled;
    save();
  }
}

export function scheduleLabel(r: Reminder): string {
  const rec: Record<string, string> = {
    DAILY: 'Every day',
    EVERY_3_DAYS: 'Every 3 days',
    EVERY_7_DAYS: 'Every 7 days',
    WEEKLY: 'Weekly',
  };
  return r.recurrence
    ? `${rec[r.recurrence] ?? r.recurrence} · ${r.time}`
    : `Once · in ${r.onceInDays ?? '?'} days · ${r.time}`;
}
