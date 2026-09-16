/* Ticket 09 (ADR-0036, ADR-0084): the medication screens move off Settings
   onto Care's own address - see settings/regimen/+page.ts. */
import { redirect } from '@sveltejs/kit';

export function load() {
  redirect(307, '/care/labs');
}
