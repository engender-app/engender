/* Phase 8 features ticket 33 (ADR-0036): the screen moved off Settings,
   the address does not - anyone who bookmarked or was sent this link
   keeps it working.

   Phase 11 all-four-doors ticket 12 repoints it at the visit screen the prep
   list is a section of, rather than at that list's own stub: ADR-0036's
   promise is that a stale bookmark lands one call away, not two. */
import { redirect } from '@sveltejs/kit';

export function load() {
  redirect(307, '/health/appointments');
}
