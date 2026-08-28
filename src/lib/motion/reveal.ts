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

import type { Action } from 'svelte/action';
import type { TransitionConfig } from 'svelte/transition';

import { EASE_OUT, EASE_OUT_CSS, fadeOnly, isReducedMotion, motionDuration } from './tokens';

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
    ? motionDuration('--dur-authored')
    : motionDuration('--dur-slow');
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
 * height rather than making everything below it jump" - and it was the
 * first place tier 3 spent the performance contract's one layout-property
 * exception. `resize`, below, is the second - both animate a single scalar
 * height rather than the chart re-tween's per-point SVG path, which is the
 * cost the contract's own escape hatch was written against. What is
 * animated here is the element's own height, so the rows under it travel
 * with it rather than being teleported down the screen by a block appearing
 * at full size.
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
  /* A bordered surface (Notice.svelte's card) never actually reached zero
     height without this: border-width is not part of the height/padding
     this already shrinks, so the box stalled at its own border - top plus
     bottom, a real but sub-pixel amount for most of the travel - and only
     visibly lost it in the last frame or two, once easing had slowed the
     interpolation down near a browser can no longer render a fraction of a
     device pixel as anything but a solid hairline. The content below rode
     the smooth shrink the whole way and then took that last sliver in one
     frame, which is what read as a jump at the end (Alicja, 2026-08-28,
     closing a notification panel).

     Continuing to interpolate the border proportionally cannot fix that:
     any value between 0 and a device pixel still paints as a full hairline,
     so the snap to invisible would keep happening somewhere near the end
     regardless of how the number is computed. Dropping it to 0 for the
     whole animation instead - the instant the transition starts rather than
     the instant it finishes - moves that same unavoidable snap to the first
     frame, while the box is still nearly full height and a lost 1px edge is
     not the thing anyone is looking at. A borderless caller measures 0 here
     and this is a no-op either way. */
  const borderTop = parseFloat(style.borderTopWidth) || 0;
  const borderBottom = parseFloat(style.borderBottomWidth) || 0;
  /* Margin is the same story as border above, and a bigger one: `.screen >
     * { margin-bottom: var(--space-6) }` (app.css) gives most direct
     * children of a screen 24px of it, disclose never touched it, and a
     * transition's `css()` keeps running for its whole declared duration -
     * the node is not actually removed until the promise it returns
     * resolves, which lands some tens of milliseconds after the animated
     * properties have already visually reached zero. So the box looked
     * fully collapsed and settled, sat there still holding a full 24px of
     * margin the whole time, and only lost it in the single frame the node
     * was finally removed - a second, separate jump landing after the
     * first one looked done (Alicja, 2026-08-28, after the border fix
     * above: "it happens in many places where a box collapses... not just
     * that singular one"). Every caller of `disclose` collapses through
     * this one function, so this fixes all of them at once rather than
     * chasing each margin-bearing surface that uses it. */
  const marginTop = parseFloat(style.marginTop) || 0;
  const marginBottom = parseFloat(style.marginBottom) || 0;

  return {
    duration: motionDuration('--dur-med'),
    easing: EASE_OUT,
    css: (t) =>
      `overflow: hidden;` +
      `height: ${t * height}px;` +
      `padding-top: ${t * paddingTop}px;` +
      `padding-bottom: ${t * paddingBottom}px;` +
      `border-top-width: ${t >= 1 ? borderTop : 0}px;` +
      `border-bottom-width: ${t >= 1 ? borderBottom : 0}px;` +
      `margin-top: ${t * marginTop}px;` +
      `margin-bottom: ${t * marginBottom}px;`
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
    duration: motionDuration('--dur-fast'),
    easing: EASE_OUT,
    css: (t) => `opacity: ${t}; position: absolute; width: ${width}px; z-index: -1; pointer-events: none`
  };
}

/**
 * Tier 3, change within a screen: a box that changes size in place travels
 * between the two, instead of snapping (phase 5 ticket 32.17).
 *
 * `disclose` covers a group being born or leaving - a transition, which only
 * fires when Svelte adds or removes the node. What this covers is the other
 * half: a node that stays mounted and changes size under its own content, the
 * shape neither `transition:` nor `in:`/`out:` can see, because nothing about
 * the node's presence changed. The measurements screen's protocol notice is
 * the case that named this - switching the segmented control swaps the
 * notice's text under it without unmounting anything, and the box resized in
 * one frame, 181px to 118px, with nothing in between (Alicja, 2026-08-26:
 * "when i switch the switcher the content of 'measuring consistently'
 * changes and the height of the box jumps").
 *
 * `interpolate-size: allow-keywords` with `transition: height` - the CSS-only
 * answer to an animated auto height - was tried first and does nothing on
 * this codebase's floor (captured every frame for 500ms after a switch;
 * height went straight from 181 to 118). So this measures instead, the way
 * `disclose` already does for the opening case: `ResizeObserver` reports the
 * node's new height after the browser has already laid it out, ResizeObserver
 * with a real gain: the point it fires at, has finished layout but not yet
 * painted. WAAPI keyframes from the last known height to that new one are
 * started in that same tick, so the paint the browser is about to do already
 * shows the animation's first frame instead of the jump.
 *
 * Height is a layout property, and the performance contract's rule is
 * transform and opacity only - `disclose` already spends the contract's one
 * named exception on exactly this, for the same reason: animating height is
 * what makes the rows below travel with the box instead of teleporting.
 * `resize` is the second spend rather than a new one, on a single scalar
 * height rather than the chart re-tween's per-point SVG path interpolation,
 * which is the cost the contract's own escape hatch was written against.
 *
 * An action, not a transition, and that difference is the whole reason this
 * is a second primitive rather than a mode on the first: a transition is a
 * function Svelte calls once, at the moment a node is created or destroyed,
 * with no way to be told about it again later. An action's `destroy` is that
 * same one-shot shape, but nothing stops it doing its own ongoing watching in
 * between - which is exactly what `ResizeObserver` is.
 *
 * `overflow: hidden` for the animation's own duration and no longer: content
 * on the way from a short box to a tall one would otherwise sit outside the
 * animating box until the box catches up, and the box's resting rule already
 * says whatever it says about its own overflow the rest of the time.
 *
 * Reduced motion skips both the observer's first, harmless call (mount, no
 * prior height to compare against) and every animation after: the box still
 * resizes, in the one frame it always could, which is tier 3's substitute -
 * a change inside a screen has no journey for a fade to stand in for, the
 * same reasoning `disclose`'s own substitute rests on.
 *
 * One box, one animation at a time, and a second resize inside the first
 * one's 240ms is missed rather than redirected. Not a corner cut: the
 * animation's own frames are resizes too, so the observer cannot tell "the
 * content changed again" from "the animation I started is still running"
 * without a signal, and the only signal available - ignore callbacks while
 * animating - is also what stops the box chasing its own frame-by-frame
 * travel forever. Content that changes twice inside 240ms lands on the
 * second change in one frame, which is where every change lands today; it
 * does not lose the first change's travel.
 *
 * It very nearly did overshoot past it, the first time this was written:
 * ignoring the second resize left `lastHeight` at the first animation's own
 * target, and once that animation's `fill: none` reverted to whatever the
 * node actually measured by then - the second change's real height, since
 * nothing had animated to it - the revert was itself a resize this same
 * observer would see, compared against that now-stale number, and re-open a
 * second animation travelling backwards from a height nothing was showing
 * any more. The `finished` handler's own re-sync below is what closes that:
 * read at the one moment nothing is overriding height, so the revert reads
 * as arriving already there rather than as a fresh resize to chase.
 */
export const resize: Action<HTMLElement> = (node) => {
  if (isReducedMotion() || typeof ResizeObserver === 'undefined') return;

  let lastHeight = node.getBoundingClientRect().height;
  let animating = false;
  let current: Animation | undefined;

  const observer = new ResizeObserver(() => {
    // The animation's own frames are themselves resizes; ignored rather than
    // measured, or the box would chase its own tail mid-travel.
    if (animating) return;

    const newHeight = node.getBoundingClientRect().height;
    const oldHeight = lastHeight;
    lastHeight = newHeight;
    // Under a pixel is a rounding wobble, not a resize - animating one would
    // run a 240ms transition over nothing to look at.
    if (Math.abs(newHeight - oldHeight) < 1) return;

    animating = true;
    const restoreOverflow = node.style.overflow;
    node.style.overflow = 'hidden';
    current = node.animate(
      [{ height: `${oldHeight}px` }, { height: `${newHeight}px` }],
      { duration: motionDuration('--dur-med'), easing: EASE_OUT_CSS }
    );
    current.finished
      .catch(() => {
        // Cancelled below, by the node leaving mid-travel - `out:disclose`
        // (Notice.svelte) owns the height property from here, and finishing
        // quietly is what stops the two fighting over it.
      })
      .finally(() => {
        node.style.overflow = restoreOverflow;
        animating = false;
        current = undefined;
        // Re-synced here rather than left at newHeight above: a resize
        // arriving mid-travel was ignored, not measured, and the node's own
        // fill: none reverts to whatever the content is by now - which is
        // that ignored resize's real height, not this animation's own
        // target, whenever the two differ. Reading it now, the one moment
        // nothing is overriding height, is what stops that reveal being
        // read as a fresh resize against a stale number and re-animated
        // backwards to a target already behind it.
        lastHeight = node.getBoundingClientRect().height;
      });
  });
  observer.observe(node);

  return {
    destroy() {
      observer.disconnect();
      current?.cancel();
    }
  };
};
