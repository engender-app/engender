/* Ticket 09 (ADR-0084): the stock editor stopped being a screen - it is a
   sheet opened from the stock line on Care's regimen block now, the same
   way the dose panel's Log sheet opens off a line on Care. A stale
   bookmark lands on Care itself rather than on a sheet nothing opened. */
import { redirect } from '@sveltejs/kit';

export function load() {
  redirect(307, '/care');
}
