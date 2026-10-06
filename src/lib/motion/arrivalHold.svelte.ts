/* Holds a read's answer back while an Android tab arrival is under way and
   too little of it is left for the answer's reveal (screenArrival.ts says
   why). */
import { ui } from '$lib/stores/ui.svelte';
import { arrivalTooShortToReveal } from './screenArrival';

/**
 * `answered` as the screen should draw it: false while an answer that
 * arrived with less than --dur-fast of the tab arrival left waits for the
 * field to stop, true from the moment it has. `canHold` says whether the
 * placeholder has been on screen at all; an answer that arrives before
 * anything was painted is not a reveal, and is never held.
 */
export function holdForArrival(answered: () => boolean, canHold: () => boolean = () => true): () => boolean {
  /* Deliberately not reactive: it only remembers whether this answer has
     been let through, and every caller reads the result each flush. */
  let shown = false;
  const released = $derived.by(() => {
    if (!answered()) return (shown = false);
    if (!shown && ui.tabMoving && canHold() && arrivalTooShortToReveal()) return false;
    return (shown = true);
  });
  return () => released;
}
