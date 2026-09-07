/* The default title for a calendar-handoff event (phase 10 redesign ticket
   03): neutral wording naming nothing about a transition, for a file that
   may land on somebody else's shared calendar (ADR-0067). It belongs on
   this side of the seam because it speaks paraglide, which calendarFile.ts
   may not import (ADR-0016) - that module stays pure so its own test can
   assert on the text it builds. */

import { m } from '$lib/paraglide/messages';
import type { CalendarEventKind } from '../calendarFile';

const DEFAULT_TITLE: Record<CalendarEventKind, () => string> = {
  appointment: m.calendar_event_appointment_title,
  surgery: m.calendar_event_surgery_title,
  letterUnlock: m.calendar_event_letter_unlock_title
};

export function calendarEventDefaultTitle(kind: CalendarEventKind): string {
  return DEFAULT_TITLE[kind]();
}
