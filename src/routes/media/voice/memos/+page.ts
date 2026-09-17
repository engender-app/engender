/* Phase 11 ticket 17: the memo browser folded into the voice screen's own
   Recordings tab - a bookmark to this address keeps landing somewhere. */
import { redirect } from '@sveltejs/kit';

export function load() {
  redirect(307, '/voice?tab=recordings');
}
