/* Ticket 09 (ADR-0084): this screen's one useful section - the running
   window's dose total - is a line on Care's regimen block now; the
   route/regimen day counts it also carried stay readable in the clinician
   summary's own exposure section. A stale bookmark lands on Care. */
import { redirect } from '@sveltejs/kit';

export function load() {
  redirect(307, '/care');
}
