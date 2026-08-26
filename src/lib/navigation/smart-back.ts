/* NAV-005: a handful of screens hardcoded where "back" goes, so arriving at
   Day from the Home heat-map and pressing back landed on Calendar - a screen
   the user never visited. The question this answers is whether there is an
   in-app entry behind this one to return to; where there is not - a deep
   link, or a reload - the hardcoded destination is the fallback rather than
   leaving the app.

   It used to answer that by reading `sveltekit:index` off `history.state`,
   which SvelteKit no longer writes: the state carries `sveltekit:history`
   and `sveltekit:navigation` timestamps now, and neither of them counts
   anything. So the read was `undefined` on every screen and every back
   control took its fallback - which is how opening an entry from the
   counterevidence screen landed on that entry's day, and how going into the
   dose log from a regimen came back to the More hub (Alicja, 2026-08-26).
   The unit test did not catch it because it stubbed the key itself.

   So the app counts its own depth instead. That is a number this app owns
   rather than one it reads out of another project's private state, which is
   the whole reason the old version could rot silently. */

import { goto } from '$app/navigation';

/** Navigations pushed since the entry the app booted on. */
let depth = 0;

/**
 * Called by the shell for every settled navigation.
 *
 * `enter` is the app arriving on its first entry, which is the floor: from
 * there, back leaves the app. Anything that pushes an entry adds one, and a
 * popstate moves by its own delta - negative going back, positive going
 * forward again.
 *
 * Clamped at zero because the browser's history holds entries from before
 * the app was opened, so a back gesture can walk off the bottom of what this
 * has counted. Left negative, the next navigation would climb back to zero
 * without having pushed anything and the app would think it had somewhere to
 * return to.
 */
export function recordNavigation(type: string, delta?: number | null): void {
  if (type === 'enter') depth = 0;
  else if (type === 'popstate') depth = Math.max(0, depth + (delta ?? 0));
  else depth += 1;
}

export function smartBack(fallback: string): void {
  if (depth > 0) history.back();
  else goto(fallback);
}
