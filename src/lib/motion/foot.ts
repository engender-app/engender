/* Move the frame's save bar without clipping the scroll area in the open.
   The opaque foot covers the room it takes. During the rise, a negative
   bottom margin keeps its layout contribution at zero. Translate from 0
   to minus its height, then clear the styles at the same visible position.
   On exit, restore the scroll room under the cover before translating
   down to zero behind the floating bar.

   The host sets the initial styles in the same step that appends the
   foot. A Svelte transition would apply its first frame too late and an
   outro inside the screen would delay route teardown. The host plays
   both animations and removes the foot once fallFoot resolves. */
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
