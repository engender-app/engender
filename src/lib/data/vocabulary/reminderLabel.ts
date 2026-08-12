/* The schedule wording for a reminder row (F25). Lived inside the
   reminder repository as hardcoded English until ticket 07; it belongs on
   this side of the seam because it speaks paraglide, which nothing the
   Node tier touches may import (ADR-0016). */

import { m } from '$lib/paraglide/messages';
import { todayEpochDay } from '../epochDay';
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

export function reminderScheduleLabel(r: Reminder): string {
  if (r.recurrence) return `${recurrenceLabel(r)} · ${r.time}`;
  // Clamped: an elapsed one-off reads "in 0 days", not "in -3 days".
  const days = Math.max(0, (r.epochDay ?? todayEpochDay()) - todayEpochDay());
  return `${m.reminder_once()} · ${m.reminder_in_days({ days })} · ${r.time}`;
}
