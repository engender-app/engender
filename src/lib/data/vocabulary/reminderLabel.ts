/* The schedule wording for a reminder row (F25). Lived inside the reminder repository as
   hardcoded English; it belongs on this side of the seam because it speaks paraglide, which
   nothing the Node tier touches may import. */

import { m } from '$lib/paraglide/messages';
import { relativeDayFromToday } from '../epochDay';
import { currentDay } from '../../stores/today.svelte';
import type { Reminder } from '../types';

function recurrenceLabel(r: Reminder): string {
  if (r.recurrence === 'DAILY') return m.recurrence_daily();
  return m.recurrence_every_n_days({ n: r.interval ?? 0 });
}

function relativeDayLabel(r: Reminder): string {
  const today = currentDay();
  const rel = relativeDayFromToday(r.epochDay ?? today, today);
  switch (rel.kind) {
    case 'today':
      return m.today();
    case 'tomorrow':
      return m.reminder_tomorrow();
    case 'in':
      return m.reminder_in_days({ days: m.n_days({ n: rel.days }) });
    case 'passed':
      return m.reminder_passed_days_ago({ days: m.n_days({ n: rel.days }) });
  }
}

export function reminderScheduleLabel(r: Reminder): string {
  if (r.recurrence) return `${recurrenceLabel(r)} · ${r.time}`;
  return `${m.reminder_once()} · ${relativeDayLabel(r)} · ${r.time}`;
}
