/* Tier 3, change within a screen: the foot arriving and leaving (carpet 26).

   The foot is a frame object now (`$lib/stores/saveBar.svelte`), so a screen
   that grows or drops one changes the height of the scroll region beside it.
   Rule 10 says a solid thing arrives from its own edge and never fades from
   nothing, and the foot's own edge is the window's bottom: it rises from
   behind the floating bar, which paints over it on the way past.

   **Why the room is a discrete swap and the travel a transform.** The
   column's room has to change at one of the two ends of the movement, and
   which end decides whether anything is ever missing. Take it at the start
   and the region is a foot shorter before the foot is there, so the last
   rows of a scrolled column are clipped away with nothing in their place -
   a yank, by the only definition that matters here (Alicja: "things
   teleporting/disappearing in 1 frame"). Take it at the end and the strip
   is clipped underneath a foot that is already over it, which is invisible,
   and is why the foot is opaque. So the foot hangs its own height below the
   frame for the whole travel - `margin-bottom` negative, so the region
   keeps its full height - and rides up on a transform. The leave runs the
   same way round: the room comes back first, under a foot that is still
   covering the strip, and the foot then travels down behind the bar.

   The arithmetic is the one thing here that is easy to get backwards, and
   getting it backwards is visible: the negative margin *is* the hidden
   state. With it, the foot contributes nothing to the column, so its own
   top edge sits on the window's bottom edge and the whole box is off the
   frame with no transform at all. Resting - margin 0 - its top is one
   foot-height higher. So the rise runs `translate` from 0 to minus its
   height and the fall from minus its height back to 0, and the frame where
   the inline styles are dropped lands on the same pixel as the animation's
   last. Written with the signs the other way round, the foot rose from
   below the window to the window's edge and then snapped 141px up when the
   styles were cleared (measured: 282px of travel where the foot is 141px
   tall).

   **Why these are animations the host plays and not Svelte transitions.**
   Written as `in:`/`out:` first, and the out half was a defect Alicja
   caught on the first flipbooks: Svelte keeps a whole `{#if}` branch's DOM
   alive until every outro inside it has finished, so a foot leaving on
   380ms held the tab it belonged to on screen for that long and then cut
   the whole screen in one frame ("foot leaves - yank between 24 and 25",
   2026-09-09). The foot is not the screen's to hold. The rise had the
   mirror-image defect at the other end: the node is appended by the action
   and a transition's first frame lands after it, so the region was a foot
   shorter for one frame before the foot was hanging ("something weird at
   'foot arrives' - at frames 1 to 3 the content seems to be travelling up,
   and then starting from frame 4 it goes down").

   So the host owns both, on the same node whose presence it owns:
   `riseFoot` hangs the foot and plays it up in the same synchronous step
   that appends it, and `fallFoot` resolves when the foot is off the frame
   and the caller may remove it. Nothing about a screen's teardown waits on
   either. */
import { EASE_OUT_CSS, isReducedMotion, motionDuration } from './tokens';

/** The mark a leaving foot carries, so the shell can tell a foot that is
    still a screen's from one that is only finishing its fall
    ($lib/motion/outgoingScreen). */
export const LEAVING = 'data-savebar-leaving';

/** How far the foot travels: its whole box, including the bottom padding
    that holds the floating bar's room, or it is cut off part-way down
    rather than gone. */
function travel(node: HTMLElement): number {
  return node.getBoundingClientRect().height;
}

/** Nothing to play: a cut was asked for, the person asked for no motion,
    or this is a server or a test with no animation to run. */
function cut(node: HTMLElement, cuts: boolean): boolean {
  return cuts || isReducedMotion() || typeof node.animate !== 'function' || !travel(node);
}

/**
 * Hang the foot below the frame and play it up. Called in the same step
 * that puts the node in the column, so the first painted frame already has
 * the region at full height.
 *
 * `cuts` is for a navigation: Svelte tears the screen down there too, and a
 * foot sliding up the window while the blind pulls the next screen over it
 * is two motions explaining one thing, so the foot arrives with the screen
 * instead. Reduced motion cuts for the reason `wipe` gives in reveal.ts -
 * "a change inside a screen has no journey to explain, so there is nothing
 * a fade would be standing in for". The crossfade DIRECTION.md rule 10
 * names is tier 2's substitute, for a navigation.
 */
export function riseFoot(node: HTMLElement, cuts = false): void {
  if (cut(node, cuts)) return;
  const height = travel(node);
  /* Inline, before the first paint: the animation below overrides these
     while it runs, and they are what hold the foot off the frame in the
     frame before it starts. Cleared together at the end, so the foot lands
     on the resting rule it already has. */
  node.style.marginBottom = `${-height}px`;
  node.style.translate = '0 0';
  const run = node.animate([{ translate: '0 0' }, { translate: `0 ${-height}px` }], {
    duration: motionDuration('--dur-slow'),
    easing: EASE_OUT_CSS,
    fill: 'backwards'
  });
  const settle = () => {
    node.style.marginBottom = '';
    node.style.translate = '';
  };
  run.finished.then(settle, settle);
}

/**
 * Give the column its room back and play the foot down behind the bar.
 * Resolves when the caller may remove the node, which is at once where the
 * travel is cut.
 */
export function fallFoot(node: HTMLElement, cuts = false): Promise<void> {
  node.setAttribute(LEAVING, '');
  if (cut(node, cuts)) return Promise.resolve();
  const height = travel(node);
  /* The room, first and in one step, while the foot is still over the strip
     it is uncovering: the margin and the transform together leave it on the
     pixel it was resting on. */
  node.style.marginBottom = `${-height}px`;
  node.style.translate = `0 ${-height}px`;
  const run = node.animate([{ translate: `0 ${-height}px` }, { translate: '0 0' }], {
    duration: motionDuration('--dur-slow'),
    easing: EASE_OUT_CSS,
    fill: 'forwards'
  });
  const done = () => undefined;
  return run.finished.then(done, done);
}
