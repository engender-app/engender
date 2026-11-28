/* Use the visit title for appointment, referral and dated update
   rows. Include the place and surgery journey where present
   (ADR-0066). Referrals and updates get event-specific keys.
   All three link to the same appointment detail. */

import { m } from '$lib/paraglide/messages';
import type { AppointmentDayRecord } from '$lib/data/journal/appointments';

export function appointmentDayRow(
  record: AppointmentDayRecord
): { key: string; title: string; subtitle?: string; href: string } {
  const title = record.kind ?? record.procedureName ?? m.appointments_untitled();
  const href = `/health/appointments/${encodeURIComponent(record.appointmentId)}`;
  switch (record.event) {
    case 'visit':
      return {
        key: `appointment-${record.id}`,
        title,
        subtitle: record.place ?? (record.kind ? record.procedureName ?? undefined : undefined),
        href
      };
    case 'referred':
      return {
        key: `appointment-referred-${record.id}`,
        title,
        subtitle: [m.day_appointment_referred(), record.place].filter(Boolean).join(' · '),
        href
      };
    case 'status':
      return { key: `appointment-status-${record.id}`, title, subtitle: record.status ?? undefined, href };
  }
}
