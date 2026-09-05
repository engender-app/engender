/* Phase 8 features ticket 33 (ADR-0036): the screen moved off Settings,
   the address does not - anyone who bookmarked or was sent this link
   keeps it working. */
import { redirect } from '@sveltejs/kit';

export function load() {
  redirect(307, '/health/cycle-events');
}
