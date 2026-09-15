/* Phase 8 features ticket 33 (ADR-0036): the screen moved off Settings,
   the address does not - anyone who bookmarked or was sent this link
   keeps it working.

   Redesign ticket 61 folded the size log into the measurements screen, so
   this stub was repointed rather than left to land on `/body/sizes`'s own
   stub: ADR-0036's promise is one call, not a chain. */
import { redirect } from '@sveltejs/kit';

export function load() {
  redirect(307, '/body/measurements');
}
