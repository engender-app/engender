/* Ticket 18 (ADR-0036): the starred shelf stopped being its own screen and
   became a filter search offers on its own screen - anyone who bookmarked
   or was sent this link keeps it working, landing on the same shelf. */
import { redirect } from '@sveltejs/kit';

export function load() {
  redirect(307, '/search?starred=1');
}
