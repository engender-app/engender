/* The schedule wording for a reminder row (F25). Lived inside the
   reminder repository as hardcoded English until ticket 07; it belongs on
   this side of the seam because it speaks paraglide, which nothing the
   Node tier touches may import (ADR-0016). */

import { m } from '$lib/paraglide/messages';
import { todayEpochDay } from '../epochDay';
import type { Reminder } from '../types';

function recurrenceLabel(r: Reminder): string {
  if (r.recurrence === 'DAILY') return m.recurrence_daily();
  if (r.recurrence === 'WEEKLY') return m.recurrence_weekly();
  return m.recurrence_every_n_days({ n: r.interval ?? 0 });
}

export function reminderScheduleLabel(r: Reminder): string {
  if (r.recurrence) return `${recurrenceLabel(r)} · ${r.time}`;
  const days = (r.epochDay ?? todayEpochDay()) - todayEpochDay();
  return `${m.reminder_once()} · ${m.reminder_in_days({ days })} · ${r.time}`;
}
