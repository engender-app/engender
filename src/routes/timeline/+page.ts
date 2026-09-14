/* Phase 10 redesign ticket 43: the rail moved onto the milestones screen,
   the address does not - anyone who bookmarked or was sent this link keeps
   it working. The /settings/* stubs (ADR-0036) are the precedent and
   tests/settings-route-redirects.test.ts covers this one alongside them. */
import { redirect } from '@sveltejs/kit';

export function load() {
  redirect(307, '/transition/milestones');
}
