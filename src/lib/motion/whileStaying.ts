/* `skip` for reveal.ts's transitions, said once (ticket 16).

   A Svelte transition on a screen's nodes can still run when the screen
   itself unmounts during a navigation, and reveal.ts cannot see SvelteKit's
   navigation state (importing `$app/state` there breaks its plain-node
   tests), so a screen passes `{ skip: navigating.to !== null }`. Search and
   a saved question each said that a dozen times. This is the same flag as
   one object whose `skip` is read when the transition starts, which is the
   moment the answer matters:

     transition:disclose={whileStaying}
*/
import { navigating } from '$app/state';

export const whileStaying = {
  get skip(): boolean {
    return navigating.to !== null;
  }
};
