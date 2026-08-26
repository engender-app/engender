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
 * was standing in for.
 *
 * `out:crossfade` on the skeleton, and nothing at all on what replaces it.
 * That asymmetry is the whole of this primitive and it was wrong the first
 * time: pairing it with an `in:` on the content produced a *sequence*
 * rather than a crossfade, and two things went wrong with that.
 *
 * The content faded in twice. A screen arriving is tier 2's, and the shell
 * already runs a shared-axis view transition over the whole of it; a
 * content fade a moment later, once the worker answers, is that same
 * content arriving a second time. Alicja saw it as "the panels fade in two
 * times, second time very close to each other and glitchy" (2026-08-26).
 *
 * And the page jumped. In an `{#if}`/`{:else}` both blocks are alive while
 * the transition runs, so a skeleton fading out in normal flow still holds
 * its height and everything under it drops when it finally goes.
 *
 * So the skeleton leaves the flow as it fades - the content is already in
 * its final position underneath, and what animates is the placeholder
 * uncovering it. Content itself is simply there, which is tier 4's default
 * and what DIRECTION.md asks for everywhere it has not authored a moment.
 *
 * Its own width is measured and pinned rather than being stretched to the
 * container. An absolutely positioned box with no width shrinks to fit, so
 * the placeholder would narrow on its first frame; and stretching it to the
 * container instead resolves against whichever ancestor happens to be
 * positioned, which is `.screen` for a placeholder at the top level of a
 * screen and something else for one nested inside a branch. The node knows
 * its own width, so it is asked. Vertical placement needs nothing: an
 * absolutely positioned box with no `top` sits at its static position, which
 * is exactly where it already was.
 *
 * z-index: -1, or the placeholder is never actually underneath. Positioning
 * takes the skeleton out of flow, but a positioned element with no z-index
 * still paints *after* normal-flow content in stacking order regardless of
 * where either one sits in the DOM (CSS2.1 Appendix E) - so without this the
 * skeleton painted over the content it was meant to be fading off of, for
 * the whole of its 160ms, which is a second "appears twice" (phase 5 ticket
 * 32.16) this primitive's own history had already named once and thought it
 * had closed by taking the skeleton out of flow. Out of flow was necessary
 * and not sufficient - it stopped the page jumping, not the paint order.
 *
 * Reduced motion takes the duration to zero through `motionDuration`: the
 * skeleton is removed on the spot, which is tier 3's substitute. There is no
 * resting rule for the `to` state to match, because the node is gone by then.
 */
export function crossfade(node: Element): TransitionConfig {
  const width = node.getBoundingClientRect().width;

  return {
    duration: motionDuration('--dur-fast', 160),
    easing: EASE_OUT,
    css: (t) => `opacity: ${t}; position: absolute; width: ${width}px; z-index: -1; pointer-events: none`
  };
}
