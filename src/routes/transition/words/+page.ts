/* Phase 10 redesign ticket 62: the words reading moved onto the Look back
   door as a block of that screen, so there is no screen at this address any
   more - but anyone who bookmarked it, or followed a link to it from an
   older build, still lands somewhere that answers. The ignore list did not
   come with it: that is a reference area now (ADR-0084) and lives at
   /settings/words, which is the address it had before phase 8 ticket 33
   moved it off. */
import { redirect } from '@sveltejs/kit';

export function load() {
  redirect(307, '/stats');
}
