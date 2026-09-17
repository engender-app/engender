/* Phase 11 all-four-doors ticket 21 (ADR-0036, ADR-0072): the Practice
   group was deleted from the hub by phase 9 carpet ticket 16, and every
   address under this prefix said which door group it used to belong to
   instead. This screen's door is Care - the address does not move with
   it, so anyone who bookmarked or was sent this link keeps it working. */
import { redirect } from '@sveltejs/kit';

export function load() {
  redirect(307, '/care/changes');
}
