/* The schedule wording for a reminder row (F25). Lived inside the
   reminder repository as hardcoded English until ticket 07; it belongs on
   this side of the seam because it speaks paraglide, which nothing the
   Node tier touches may import (ADR-0016). */

import { m } from '$lib/paraglide/messages';
import { relativeDayFromToday, todayEpochDay } from '../epochDay';
import type { Reminder } from '../types';

const TYPE_NAME: Record<Reminder['type'], () => string> = {
  med: m.rem_type_med,
  injection: m.rem_type_injection,
  appointment: m.rem_type_appointment,
  other: m.rem_type_other
};

/** The wording for a reminder's type. The row used to print the stored
    value, so a Polish reader read "med" and "injection" in English. */
export function reminderTypeLabel(type: Reminder['type']): string {
  return TYPE_NAME[type]();
}

function recurrenceLabel(r: Reminder): string {
  if (r.recurrence === 'DAILY') return m.recurrence_daily();
  if (r.recurrence === 'WEEKLY') return m.recurrence_weekly();
  return m.recurrence_every_n_days({ n: r.interval ?? 0 });
}

function relativeDayLabel(r: Reminder): string {
  const today = todayEpochDay();
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
