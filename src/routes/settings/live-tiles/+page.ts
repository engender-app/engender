/* Deepening ticket 09 merged this screen into /settings/notifications;
   phase 11 ticket 04 took the tiles themselves off that screen and onto
   Today's own editor. Either way the address keeps landing somewhere real
   for anyone who bookmarked it or was sent the link (ADR-0036).

   An ordinary stub since ticket 04, like the other twenty-seven. It used to
   be a client-side `replaceRoute` in a `+page.svelte`, on the argument that
   this app has no server - but `load` runs in the browser under
   adapter-static with `ssr = false` too, and a thrown redirect is what
   settings-route-redirects.test.ts can actually read. */
import { redirect } from '@sveltejs/kit';

export function load() {
  redirect(307, '/settings/notifications');
}
