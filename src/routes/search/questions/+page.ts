/* Ticket 18 (ADR-0036): the saved-questions list stopped being its own
   screen - a chip on search's own opening state links straight to a run
   instead (`/search/questions/[id]`, unmoved) - so anyone who bookmarked
   or was sent this link keeps it working, landing where that chip row is. */
import { redirect } from '@sveltejs/kit';

export function load() {
  redirect(307, '/search?questions=1');
}
