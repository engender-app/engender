/* NAV-005: a handful of screens hardcoded where "back" goes, so arriving at
   Day from the Home heat-map and pressing back landed on Calendar - a
   screen the user never visited. SvelteKit stamps a `sveltekit:index` on
   `history.state` for every client-side navigation, starting at 0 for the
   entry the app booted on; a value above 0 means there really is an in-app
   entry behind this one to return to. Below that (a deep link, or a reload)
   there is nothing to go back to inside the app, so the hardcoded
   destination stays as the fallback rather than leaving the app. */

import { goto } from '$app/navigation';

export function smartBack(fallback: string): void {
  const index = history.state?.['sveltekit:index'];
  if (typeof index === 'number' && index > 0) {
    history.back();
  } else {
    goto(fallback);
  }
}
