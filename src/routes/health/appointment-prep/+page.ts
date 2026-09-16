/* Phase 11 all-four-doors ticket 12 (ADR-0036, ADR-0066): the prep list is a
   section of the visit screen now. It was never a record of its own - the
   standing list, the appointment and the debrief were three descriptions of
   one thing (hubRows.ts) - and the address it had keeps working. */
import { redirect } from '@sveltejs/kit';

export function load() {
  redirect(307, '/health/appointments');
}
