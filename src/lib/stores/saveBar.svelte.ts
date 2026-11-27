/* Host the screen's save bar in the app column. hostSaveBar moves its
   rendered node out of the scroll region, where it becomes the region's
   flex sibling. Layout reserves the bar's height, keeping controls clear
   of it even at the end of the scroll.

   Moving the node preserves the screen's handlers, state and scoped styles.
   Its unmount still removes its bar. */

import { fallFoot, riseFoot } from '$lib/motion/foot';

/** Selector for the box the bar is moved into: `.app-column` in +layout.svelte. */
const COLUMN = '[data-app-column]';

/* How many bars the frame is holding. The column reads it to know whether
   to stop reserving `--nav-clearance` for the floating bar, which the bar's
   own foot holds instead once there is one. A count rather than a flag
   because mounting and unmounting interleave: a screen that replaces its
   foot with another one has both mounted for the moment between the new
   node's action running and the old node's teardown. */
import { saveBar } from './ui.svelte';
export { saveBar };

/**
 * Svelte action: host this node in the app column instead of in the screen,
 * and own both ends of its life there - it arrives on a rise and leaves on
 * a fall, and it is removed when the fall is done ($lib/motion/foot).
 *
 * `cuts` is asked at both ends rather than read once, because the answer
 * changes between them: a foot that arrived inside a screen can be leaving
 * because the screen is, and a navigation carries the foot in the screen's
 * own snapshot instead of moving it twice.
 *
 * A tree with no column - a component mounted outside the shell, or a test
 * rendering the bar on its own - leaves the node where it is and counts
 * nothing, so the bar is still drawn and still reachable.
 */
export function hostSaveBar(node: HTMLElement, options?: { cuts?: () => boolean }) {
  const column = node.ownerDocument.querySelector(COLUMN);
  if (!column) return;
  column.append(node);
  saveBar.count += 1;
  riseFoot(node, options?.cuts?.() ?? false);
  return {
    destroy() {
      /* The room is released here rather than when the node goes, so the
         column stops reserving a foot's height the moment the foot starts
         leaving - which is the same moment `fallFoot` gives that height
         back to the region, under a foot still covering the strip. */
      saveBar.count -= 1;
      /* Its own removal, because moving it took that away: Svelte removes a
         block's nodes as a range between the anchors it left in the
         markup, and this node is no longer between them - so the frame
         kept every foot every screen had ever mounted. Measured on the
         first motion run: two stacked in the column at once. `remove()` on
         a node already gone is a no-op, so this stays right if Svelte's
         own removal ever reaches it. */
      fallFoot(node, options?.cuts?.() ?? false).then(() => node.remove());
    }
  };
}
