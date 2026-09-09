/* The save bar's room, held by the frame rather than by the screen
   (carpet 26).

   A screen's foot was a `position: sticky` block at the end of the content
   column, and a pinned thing inside a scroll region covers whatever the
   column happens to have at that height. On `/settings/dimension` that was
   the bottom 19px of a 48px slider at rest; the same slider inside the
   entry editor lost 44 of its 48, and `/media/photos/export` covered 36px
   of a selected photo cell (carpet 28's occlusion pass, three of the nine
   save-bar screens). 48px is Android's touch floor and `z-index: 20` makes
   the covered half unclickable rather than merely hidden, so it is an
   accessibility defect and not a cosmetic one.

   Nothing the column can do fixes that from inside. Padding it moves the
   sticky bar down with it, since a sticky box is clamped by its own
   containing block; a margin on the bar buys scroll travel and changes
   nothing at rest; `scroll-padding-bottom` is for scroll-into-view. What
   the app already had was the answer one floor up: the floating bar lives
   in the frame and the column reserves `--nav-clearance` for it. This is
   the same answer for the second pinned thing.

   So the bar is drawn by the screen that owns its buttons and hosted by the
   frame: `hostSaveBar` moves the rendered node out of the scroll region and
   into the app column, where it is the region's flex sibling. The
   reservation is then layout rather than arithmetic - the region is a bar
   shorter, so nothing is ever under the bar at any scroll position, and
   there is no height for CSS to have to know.

   Moving the node rather than handing a snippet to the layout is what keeps
   the buttons owned by the screen: their handlers, their `$state` and their
   component's scoped styles all travel with the node, and a screen that
   unmounts takes its own foot with it.  */

/** Selector for the box the bar is moved into: `.app-column` in +layout.svelte. */
export const COLUMN = '[data-app-column]';

/* How many bars the frame is holding. The column reads it to know whether
   to stop reserving `--nav-clearance` for the floating bar, which the bar's
   own foot holds instead once there is one. A count rather than a flag
   because mounting and unmounting interleave: a screen that replaces its
   foot with another one has both mounted for the moment between the new
   node's action running and the old node's teardown. */
export const saveBar = $state({ count: 0 });

/**
 * Svelte action: host this node in the app column instead of in the screen.
 * A tree with no column - a component mounted outside the shell, or a test
 * rendering the bar on its own - leaves the node where it is and counts
 * nothing, so the bar is still drawn and still reachable.
 */
export function hostSaveBar(node: HTMLElement) {
  const column = node.ownerDocument.querySelector(COLUMN);
  if (!column) return;
  column.append(node);
  saveBar.count += 1;
  return {
    destroy() {
      saveBar.count -= 1;
      /* Its own removal, because moving it took that away: Svelte removes a
         block's nodes as a range between the anchors it left in the
         markup, and this node is no longer between them - so the frame
         kept every foot every screen had ever mounted. Measured on the
         first motion run: two stacked in the column at once. `remove()` on
         a node already gone is a no-op, so this stays right if Svelte's
         own removal ever reaches it. */
      node.remove();
    }
  };
}
