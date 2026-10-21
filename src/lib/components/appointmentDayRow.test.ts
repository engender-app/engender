/* The day view's appointment rows (functional-audit ticket 26): a wait
   reaches a day on its referred-on day and on each update's day, and each
   row says which of the three happened. */

import assert from 'node:assert/strict';
import { test, vi } from 'vitest';
import type { AppointmentDayRecord } from '$lib/data/journal/appointments';

// The module's own `$lib/paraglide/messages` import, pointed at the real
// compiled catalogue (vitest has no `$lib` alias).
vi.mock('$lib/paraglide/messages', async () => await import('../paraglide/messages.js'));
const { appointmentDayRow } = await import('./appointmentDayRow.ts');
const { m } = await import('../paraglide/messages.js');

const base = { kind: 'Gender clinic', place: 'Charing Cross', procedureId: null, procedureName: null };

test('a visit, a referral and an update each read as what happened that day', () => {
  const records: AppointmentDayRecord[] = [
    { ...base, id: 'v', event: 'visit', status: null },
    { ...base, id: 'w', event: 'referred', status: null },
    { ...base, id: 's', event: 'status', status: 'Letter came' }
  ];
  assert.deepEqual(records.map(appointmentDayRow), [
    { key: 'appointment-v', title: 'Gender clinic', subtitle: 'Charing Cross' },
    { key: 'appointment-referred-w', title: 'Gender clinic', subtitle: `${m.day_appointment_referred()} · Charing Cross` },
    { key: 'appointment-status-s', title: 'Gender clinic', subtitle: 'Letter came' }
  ]);
});

test('a visit with no kind falls back to its journey, then to the plain word', () => {
  assert.equal(appointmentDayRow({ ...base, kind: null, procedureName: 'Top surgery', id: 'a', event: 'visit', status: null }).title, 'Top surgery');
  assert.equal(
    appointmentDayRow({ ...base, kind: null, id: 'a', event: 'status', status: 'x' }).title,
    m.appointments_untitled()
  );
});
