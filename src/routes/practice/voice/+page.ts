/* Phase 11 all-four-doors ticket 21 (ADR-0036, ADR-0072): the Practice
   group was deleted from the hub by phase 9 carpet ticket 16, and every
   address under this prefix said which door group it used to belong to
   instead. This screen moved to the root rather than under a door
   prefix, unlike its siblings. Its own `?tab=`/`?metric=` queries carry
   the tab or sheet a bookmark meant, so the stub forwards whatever query
   it was given rather than a fixed one. */
import { redirect } from '@sveltejs/kit';

export function load({ url }) {
  redirect(307, `/voice${url.search}`);
}
