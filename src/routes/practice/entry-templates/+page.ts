/* Redesign ticket 51 (ADR-0084): entry templates is a reference area, moved
   onto Settings rather than hosted by it - the address does not move with
   it, so anyone who bookmarked or was sent this link keeps it working.
   ADR-0036's own bargain run backwards: it left this address pointing out at
   the hub, and this one points back in. */
import { redirect } from '@sveltejs/kit';

export function load() {
  redirect(307, '/settings/entry-templates');
}
