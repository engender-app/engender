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

   Left to right, and only left to right. A wipe from another edge is a
   parameter this has no use for yet, so the first screen that needs one adds
   it rather than this ticket shipping three directions nothing calls.

   Like the tier-2 primitives in navigation.ts, this reads its duration and
   its easing out of the token layer and writes its own reduced-motion
   substitute, because the 1ms clamp in theme/base.css is a CSS rule and never
   touches a Svelte transition. */

import type { TransitionConfig } from 'svelte/transition';

import { EASE_OUT, fadeOnly, isReducedMotion, motionDuration } from './tokens';

/** Whether the runtime can clip at all.

    Asked per call rather than once at module load so it can be stubbed, and
    answered optimistically where there is no CSS object to ask: that is a
    server or a test rather than a browser, and neither renders anything. */
function canClip(): boolean {
  if (typeof CSS === 'undefined' || typeof CSS.supports !== 'function') return true;
  return CSS.supports('clip-path', 'inset(0 100% 0 0)');
}

/**
 * Tier 3, change within a screen: a wipe, uncovering from the left.
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
export function wipe(_node: Element, params?: { authored?: boolean }): TransitionConfig {
  if (isReducedMotion()) return { duration: 0 };

  /* `authored` is the longer of the two durations, for a wipe that is the
     one moment a surface arrives rather than one state replacing another.
     The area chart's first draw asked for it: at --dur-slow the uncovering
     read as a flicker rather than as a drawing (Alicja, 2026-08-25, "a
     little slower and not linear"). The easing is --ease-out either way,
     which is the "not linear" half - a wipe that arrives at a constant rate
     reads as a wipe rather than as something being revealed. */
  const duration = params?.authored
    ? motionDuration('--dur-authored', 700)
    : motionDuration('--dur-slow', 380);
  if (!canClip()) return fadeOnly(duration);

  return {
    duration,
    easing: EASE_OUT,
    /* inset() is top right bottom left, so uncovering from the left means the
       right is what stays clipped.

       Plain 0 rather than 0% at the end, so the last frame is literally
       `inset(0 0 0 0)` - the element's resting geometry written the way the
       stylesheet would write it, rather than a value that only normalises to
       it. tests/motion-system.test.ts has to do that normalising for CSS; a
       transition can just not need it. */
    css: (_t, u) => `clip-path: inset(0 ${u === 0 ? '0' : `${Number((u * 100).toFixed(2))}%`} 0 0)`
  };
}

/**
 * Tier 3, change within a screen: a group opening its own height.
 *
 * DIRECTION.md names this case by itself - "a list insertion opens its own
 * height rather than making everything below it jump" - and it is the one
 * place tier 3 is allowed a layout property. What is animated is the
 * element's own height, so the rows under it travel with it rather than
 * being teleported down the screen by a block appearing at full size.
 *
 * The cap is the same as the wipe's, and stricter in practice: one group at
 * a time, and a group rather than a screen. A disclosure that opens half the
 * document is a screen, and belongs to tier 2 as a navigation instead.
 *
 * Reduced motion is an instant cut, which is tier 3's substitute: a group
 * opening inside a screen has no journey for a fade to stand in for, and the
 * chevron beside it has already turned to say what happened.
 *
 * The `to` state is `height: auto` by way of `scaleY`-free arithmetic on the
 * measured height, so the resting rule the element already has is what it
 * lands on - the invariant DIRECTION.md's reduced-motion contract imposes on
 * every animation in the app.
 */
export function disclose(node: Element): TransitionConfig {
  if (isReducedMotion()) return { duration: 0 };

  const style = getComputedStyle(node);
  const height = parseFloat(style.height) || 0;
  const paddingTop = parseFloat(style.paddingTop) || 0;
  const paddingBottom = parseFloat(style.paddingBottom) || 0;

  return {
    duration: motionDuration('--dur-med', 240),
    easing: EASE_OUT,
    css: (t) =>
      `overflow: hidden;` +
      `height: ${t * height}px;` +
      `padding-top: ${t * paddingTop}px;` +
      `padding-bottom: ${t * paddingBottom}px;`
  };
}

/**
 * Tier 3, change within a screen: a skeleton crossfading into the content it
 * was standing in for, rather than being swapped for it in one frame.
 *
 * `out:crossfade` on the skeleton and `in:crossfade` on what replaces it -
 * the empty state included, since a first-run journal lands on that branch
 * and owes the same arrival as a populated one.
 *
 * Here rather than declared per screen. Ticket 25 wrote this same line into
 * twenty-four routes before the review caught it, which is the point at
 * which a shape stops being a call site and starts being a primitive. The
 * three screens that had it first - Home, the calendar and Stats - still
 * carry their own copy; folding those in is a change to screens this ticket
 * does not otherwise touch.
 *
 * Reduced motion takes the duration to zero through `motionDuration`, which
 * is tier 3's substitute: a change inside a screen has no journey for a fade
 * to stand in for.
 */
export function crossfade(_node: Element): TransitionConfig {
  return fadeOnly(motionDuration('--dur-fast', 160));
}
