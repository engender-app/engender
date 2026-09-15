/* Phase 10 redesign ticket 61: the size log and the measurements screen
   became one screen, the address does not - anyone who bookmarked or was
   sent this link keeps it working. The same stub ADR-0036's twenty-three
   moved routes carry, for the same reason.

   `/settings/sizes`, ADR-0036's own stub for this area, points straight
   at `/body/measurements` rather than at this file, so a stale bookmark
   is still one call away and not two. */
import { redirect } from '@sveltejs/kit';

export function load() {
  redirect(307, '/body/measurements');
}
