/* Ticket 09 (ADR-0036): the dose log joins the rest of the medication
   module under Care's own prefix - see ../settings/regimen/+page.ts. */
import { redirect } from '@sveltejs/kit';

export function load() {
  redirect(307, '/care/doses');
}
