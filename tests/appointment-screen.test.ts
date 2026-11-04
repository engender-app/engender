/* prh12: each appointment opens its own screen rather than an editor sheet
   over the list, and everything about it is edited there in place. Read off
   the source the way surgery-hub.test.ts holds the procedure screen; the
   browser half is tests/appointment-entry-check.mjs. */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path: string) => readFileSync(root + path, 'utf8');
const LIST = 'src/routes/health/appointments/+page.svelte';
const SCREEN = 'src/routes/health/appointments/[id]/+page.svelte';

describe('one screen per appointment', () => {
  it('opens every visit and every wait on its own screen from the list', () => {
    const list = read(LIST);
    expect(list).toContain('const screenOf = (appointment: Appointment | WaitingAppointment) => `/health/appointments/${appointment.id}`');
    // The opening block, the visit rows and the wait rows are links.
    expect(list).toMatch(/<a\s+class="visit-lead"[\s\S]*?href=\{screenOf\(nextVisit\)\}/);
    expect(list.match(/href=\{screenOf\(appointment\)\}/g)).toHaveLength(2);
    // Nothing on the list opens an existing appointment in a sheet.
    expect(list).not.toMatch(/record\.openEditor\((appointment|nextVisit)/);
    expect(list).not.toContain('fromRecord');
    // A new one is still made in the sheet, and arrives in its list.
    expect(list).toContain('record.openEditor(null)');
    expect(list).toContain('<AppointmentFields');
    // What to raise sits above the waiting lists.
    expect(list.indexOf('<AppointmentPrep')).toBeLessThan(list.indexOf('data-waiting transition:collapse'));
  });

  it('lays the appointment out and edits it in place', () => {
    const screen = read(SCREEN);
    expect(screen).toContain('detailDraft<Record, Draft>');
    expect(screen).toContain('<AppointmentFields');
    for (const handle of [
      'data-save-appointment', 'data-save-appointment-note', 'data-add-to-calendar', 'data-delete-appointment',
      'data-confirm-delete-appointment', 'data-add-status-update', 'data-appointment-procedure'
    ]) expect(screen, handle).toContain(handle);
    // What to raise on an upcoming visit, the same one list the list screen draws.
    expect(screen).toMatch(/\{#if visitState === 'upcoming'\}\s*<AppointmentPrep/);
    // A fixed field title: a title arriving with the read grew the field in
    // one frame on the procedure screen.
    expect(screen).toContain('<ScreenHeader title={m.appointment_screen_title()} back={LIST} />');
    // A save that changes the state crossfades the log and holds the fields still.
    expect(screen).toContain('{#key visitState}');
    expect(screen).toContain('new ResizeObserver(settle)');
  });

  it('links rows elsewhere in the app to the appointment they are about', () => {
    expect(read('src/lib/components/searchHitRows.ts')).toContain("href: (hit) => `${hubRow('appointments').href}/${hit.id}`");
    expect(read('src/lib/components/dayRows.ts')).not.toContain("'/health/appointments'");
    expect(read('src/lib/features.ts')).toContain("'/health/appointments/[id]'");
  });
});
