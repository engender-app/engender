/* Tier 3 of the motion system set out in DIRECTION.md, which lives on
   ticket 15's branch: change within a screen.

   Phase 5 ticket 28's third material, and the only one that is geometry
   rather than a value, which is why it is here rather than in materials.css
   or the token layer. A wipe uncovers content along one edge instead of
   fading it in: it says the content was already composed and is being
   revealed, where a fade says it has just been assembled. On a screen whose
   numbers the person already knows, revealed is the truer of the two.

   Cap: one region at a time, and a region the size of a card rather than a
   screen. Chromium repaints the clipped subtree on every frame of a clip-path
   animation, so the cost is the area times the complexity of what is inside
   it - which is exactly why the obvious use for this is not claimed here.
   DIRECTION.md's contract names tier 3's chart re-tween as the thing that
   might become a clip-path reveal instead. Whether it should is ticket 27's
   measurement over real screens, not this ticket's guess: a wipe over a
   365-point path could repaint more per frame than the tween it replaced.

   Like the tier-2 primitives in navigation.ts, this reads its duration out of
   the token layer and writes its own reduced-motion substitute, because the
   1ms clamp in theme/base.css is a CSS rule and never touches a Svelte
   transition. */

import { quintOut } from 'svelte/easing';
import type { TransitionConfig } from 'svelte/transition';

import { isReducedMotion, motionDuration } from './tokens';

/* --ease-out, sampled the same way navigation.ts samples it - see the note
   there for why quintOut and cubic-bezier(0.22, 1, 0.36, 1) are one easing
   rather than two that look alike. */
const EASE_OUT = quintOut;

/** The edge the content is uncovered from. */
export type Edge = 'left' | 'right' | 'top' | 'bottom';

/** `inset()` covering `covered` of the element from the opposite side, so
    the named edge is the one the content appears at. */
function coveredFrom(edge: Edge, covered: number): string {
  /* Plain 0 rather than 0% at the end, so the last frame is literally
     `inset(0 0 0 0)` - the element's resting geometry written the way the
     stylesheet would write it, rather than a value that only normalises to
     it. tests/motion-system.test.ts has to do that normalising for CSS; a
     transition can just not need it. */
  const amount = covered === 0 ? '0' : `${Math.round(covered * 100)}%`;
  const sides = {
    /* inset() is top right bottom left: uncovering from the left means the
       right is what stays clipped. */
    left: ['0', amount, '0', '0'],
    right: ['0', '0', '0', amount],
    top: ['0', '0', amount, '0'],
    bottom: [amount, '0', '0', '0']
  }[edge];
  return `inset(${sides.join(' ')})`;
}

/** Whether the runtime can clip at all.

    Asked per call rather than once at module load so it can be stubbed, and
    answered optimistically where there is no CSS object to ask: that is a
    server or a test rather than a browser, and neither renders anything. */
function canClip(): boolean {
  if (typeof CSS === 'undefined' || typeof CSS.supports !== 'function') return true;
  return CSS.supports('clip-path', 'inset(0 100% 0 0)');
}

/**
 * Tier 3, change within a screen: a wipe.
 *
 * Usable as `in:wipe` and `out:wipe` - Svelte runs the timeline backwards on
 * the way out, so content leaves by being covered again from the same edge.
 *
 * Reduced motion substitutes an instant cut, which is tier 3's substitute
 * rather than tier 2's crossfade: a change inside a screen has no journey to
 * explain, so there is nothing a fade would be standing in for.
 *
 * Where `clip-path` is missing the content fades in over the same duration.
 * That is a weaker version of the same idea rather than a broken one, which
 * is what a degradation path has to be.
 */
export function wipe(_node: Element, params: { from?: Edge } = {}): TransitionConfig {
  if (isReducedMotion()) return { duration: 0 };

  const duration = motionDuration('--dur-slow', 380);
  if (!canClip()) return { duration, easing: EASE_OUT, css: (t) => `opacity: ${t}` };

  const from = params.from ?? 'left';
  return { duration, easing: EASE_OUT, css: (_t, u) => `clip-path: ${coveredFrom(from, u)}` };
}
