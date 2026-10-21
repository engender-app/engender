/* What an appointment's row on a day says (ticket 57, functional-audit
   ticket 26). Its own module so the wording is provable without the rest of
   dayRows.ts's imports.

   What the appointment was, with where it was underneath it. An appointment
   nobody named a kind for says only "appointment", because the app ships no
   kinds of its own to guess with (ADR-0066); one that belongs to a surgery
   journey says so, since that is what a consult read as before the record
   existed.

   A wait reaches a day twice over: on the day somebody was referred, which
   the row says, and on each day an update came, which the row quotes. Same
   title as the visit, so the three read as one appointment's history. A
   visit keeps the key it always had; the other two name their event, since
   a referral carries its appointment's id too. */

import { m } from '$lib/paraglide/messages';
import type { AppointmentDayRecord } from '$lib/data/journal/appointments';

export function appointmentDayRow(record: AppointmentDayRecord): { key: string; title: string; subtitle?: string } {
  const title = record.kind ?? record.procedureName ?? m.appointments_untitled();
  switch (record.event) {
    case 'visit':
      return {
        key: `appointment-${record.id}`,
        title,
        subtitle: record.place ?? (record.kind ? record.procedureName ?? undefined : undefined)
      };
    case 'referred':
      return {
        key: `appointment-referred-${record.id}`,
        title,
        subtitle: [m.day_appointment_referred(), record.place].filter(Boolean).join(' · ')
      };
    case 'status':
      return { key: `appointment-status-${record.id}`, title, subtitle: record.status ?? undefined };
  }
}
