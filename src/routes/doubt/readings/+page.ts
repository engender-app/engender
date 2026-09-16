/* Phase 11 ticket 15: the tiles and charts this address held were a Look
   back page sitting on the Safe space door - a count of everything written,
   a 30-day mood area and the affirming themes. Look back is where a reading
   belongs, and ticket 07 gives each of these a tile there, so the address
   lands on that door rather than keeping a second copy of it.

   Safe space keeps a way down to them (`safeSpaceWays.ts`, worded as Look
   back words it) - what went is the duplicate screen, not the reading. */
import { redirect } from '@sveltejs/kit';

export function load() {
  redirect(307, '/stats');
}
