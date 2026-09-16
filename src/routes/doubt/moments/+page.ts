/* Phase 11 ticket 15: "Letters and photos" was a screen of its own under
   Safe space showing the same unlocked letters `/transition/letters` shows
   in its Open section, one door apart, plus the starred photographs. Both
   are on the letters screen now, so this address lands there in one hop -
   ADR-0036's rule for every other screen that moved.

   The fragment is not sent from here. A redirect carrying one would put
   Safe space's row and a stale bookmark on the same footing, and a person
   who typed this address wants the screen, not a scroll position. The row
   in `safeSpaceWays.ts` is what asks for `#opened`. */
import { redirect } from '@sveltejs/kit';

export function load() {
  redirect(307, '/transition/letters');
}
