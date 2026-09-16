/* Ticket 09 (ADR-0036, ADR-0084): the medication screens move off Settings
   onto Care's own address - Care already links to this screen and no
   other row in the app leads here through /settings, so a stale bookmark
   is the only thing this stub is for. */
import { redirect } from '@sveltejs/kit';

export function load() {
  redirect(307, '/care/regimen');
}
