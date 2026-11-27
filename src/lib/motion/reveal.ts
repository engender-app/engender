/* Animate changes inside a screen. A left-to-right wipe uncovers
   one card-sized region at a time. Chromium repaints the clipped
   subtree each frame, so the cost grows with its area and complexity.
   Measure before extending a wipe to a large chart.

   Read durations and easing from the tokens. Implement the
   reduced-motion substitute in each primitive because Svelte
   transitions bypass the stylesheet's timing clamp. */

import type { Action } from 'svelte/action';
import { isDoorActive } from '../navigation/doorActivity';
import type { TransitionConfig } from 'svelte/transition';

import { EASE_OUT, EASE_OUT_CSS, EASE_OUT_SOFT_CSS, fadeOnly, isReducedMotion, motionDuration } from './tokens';
import { markScreenArrival, endScreenArrival, stillArriving, readRevealDuration } from './screenArrival';

export { markScreenArrival, endScreenArrival, stillArriving };

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

  /* `authored` is the longer of the two durations, for a wipe that is the one moment a
     surface arrives rather than one state replacing another. The area chart's first draw
     asked for it: at --dur-slow the uncovering read as a flicker rather than as a drawing.
     The easing is --ease-out either way, which is the "not linear" half - a wipe that
     arrives at a constant rate reads as a wipe rather than as something being revealed. */
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
       it. tests/node/ui/motion-system.test.ts has to do that normalising for CSS; a
       transition can just not need it. */
    css: (_t, u) => `clip-path: inset(0 ${u === 0 ? '0' : `${Number((u * 100).toFixed(2))}%`} 0 0)`
  };
}

/**
 * Tier 3, change within a screen: a shape opening from its own axis, both
 * ways at once.
 *
 * The wipe above uncovers from one edge, which is what a plot that runs left
 * to right wants. A mirrored figure does not: the paired pitch density is two
 * shapes measured outward from a spine down the middle
 * (PitchFigure.svelte). Uncovering it
 * from the left would draw the earlier read arriving before the later one -
 * a sequence the picture does not have. This opens from the middle instead,
 * so both shapes grow off the axis they were measured from.
 *
 * Same contract as the wipe otherwise: `clip-path` where there is one, a fade
 * of the same length where there is not, an instant cut under reduced motion.
 */
export function spread(_node: Element, params?: { authored?: boolean }): TransitionConfig {
  if (isReducedMotion()) return { duration: 0 };

  const duration = params?.authored
    ? motionDuration('--dur-authored')
    : motionDuration('--dur-slow');
  if (!canClip()) return fadeOnly(duration);

  return {
    duration,
    easing: EASE_OUT,
    /* Half the remaining distance off each side, so the two edges travel
       apart at the same rate and meet the element's own geometry together.
       Plain 0 at the end, for the reason the wipe gives. */
    css: (_t, u) => {
      const inset = u === 0 ? '0' : `${Number((u * 50).toFixed(2))}%`;
      return `clip-path: inset(0 ${inset} 0 ${inset})`;
    }
  };
}

/**
 * Animate a group opening its own height so the rows below it move in
 * the same frames. Apply the layout exception to one group at a time.
 * Settle at the element's normal auto height. Reduced motion cuts the
 * transition.
 *
 * Pass params.skip when navigation unmounts a permanent screen node.
 * Svelte's transition modifiers cannot distinguish that exit from a
 * local removal. The caller can read navigating.to, which keeps the
 * primitive usable in the Node tier.
 */
export function disclose(
  node: Element,
  params?: { skip?: boolean; onScreen?: boolean; belowFold?: boolean },
  /* `fadeEdges`: the panel primitive's closing. A box's hairlines were cut to nothing on
     the first frame of a close, because a border cannot shrink below a device pixel and
     stalled the box at its own edge; read that first frame as the line simply disappearing
     and asked for it to "fade out with scale like other lines". So the edges stay for the
     travel and the whole box fades over its last third, lines included - the box is nearly
     nothing by then, so what fades is the line. Arrivals never take this: a block arriving
     from nothing must not fade in. */
  options?: { fadeEdges?: boolean }
): TransitionConfig {
  if (isReducedMotion() || params?.skip) return { duration: 0 };
  /* `belowFold` (carpet 15 row 47): a box that arrives wholly under the
     screen's bottom edge arrives at once, since nothing of its travel would
     be painted, and one that lands where it can be seen still opens. The
     roadmap fills its legal group this way a few rows a frame. */
  if (
    params?.belowFold &&
    typeof innerHeight === 'number' &&
    typeof node.getBoundingClientRect === 'function' &&
    node.getBoundingClientRect().top >= innerHeight
  )
    return { duration: 0 };
  const fadeEdges = options?.fadeEdges === true;

  const style = getComputedStyle(node);
  const height = parseFloat(style.height) || 0;
  const paddingTop = parseFloat(style.paddingTop) || 0;
  const paddingBottom = parseFloat(style.paddingBottom) || 0;
  /* Turn off the border during height travel. At subpixel widths
     the browser still paints a hairline, so interpolating the border
     left a last-frame jump under the panel. Removing it before the
     panel shrinks keeps the jump out of the final frames. A borderless
     surface already measures zero. */
  const borderTop = parseFloat(style.borderTopWidth) || 0;
  const borderBottom = parseFloat(style.borderBottomWidth) || 0;
  /* Margin is the same story as border above, and a bigger one: `.screen > { margin-bottom:
     var(--space-6) }` (app.css) gives most direct children of a screen 24px of it, disclose
     never touched it, and a transition's `css()` keeps running for its whole declared
     duration - the node is not actually removed until the promise it returns resolves,
     which lands some tens of milliseconds after the animated properties have already
     visually reached zero. So the box looked fully collapsed and settled, sat there still
     holding a full 24px of margin the whole time, and only lost it in the single frame the
     node was finally removed - a second, separate jump landing after the first one looked
     done. Every caller of `disclose` collapses through this one function, so this fixes all
     of them at once rather than chasing each margin-bearing surface that uses it. */
  const marginTop = parseFloat(style.marginTop) || 0;
  const marginBottom = parseFloat(style.marginBottom) || 0;
  /* Pin a grid's measured tracks during the collapse so the clip
     covers stationary content. A smaller definite height otherwise
     compresses auto tracks and moves centered items. getComputedStyle
     already supplies pixel track sizes.

     Ordinary blocks stay top-anchored. A missing display value is treated
     as a non-grid caller. */
  const rows = style.display?.includes('grid') ? style.gridTemplateRows : '';
  /* Where the box's bottom margin ends, and it is not always zero. While the box is open,
     `overflow: hidden` makes it a formatting context, so the margins on either side of it
     do not collapse through it: the block above's 20 and the heading below's 40 are both
     spent, 60 in all. The frame the node is gone they collapse into one, 40. Animating this
     margin to zero therefore lands 20px short of where the neighbours will meet, and the
     page takes that 20 in the frame of removal. The end value is the negative of the
     smaller neighbouring margin, which is exactly what collapsing would have taken away: 20
     + 0 + (40 - 20) = 40. Block flow only - flex and grid items never collapse margins -
     and only with a neighbour on each side to collapse between. */
  const restMargin = restingMarginBelow(node);
  /* The other side of `overflow: hidden` making the box a formatting
     context: a first child's top margin that collapsed through the box's
     top edge at rest stops collapsing and lands inside it, so the content
     drops by that margin in the first frame and the box, measured without
     it, clips that much off its bottom (the Transition door's index: the
     first heading's 16px, "Body" moving down on the keystroke). The box is
     pulled up by the same margin and made taller by it, so the content
     stays where it was and the edge below it does too. */
  const swallowed = collapsedTopMargin(node, style);
  /* `onScreen`: a block far taller than the screen travels only the part the viewport
     shows, the way `resize` does, and takes the rest at the end, below the fold where
     nothing is painted. The roadmap's 23 Polish steps are 2967px; travelled whole under
     ease-out, the edge crossed the visible part of the screen in one frame and the steps
     painted at once. */
  const full = height + swallowed;
  const top = params?.onScreen && typeof node.getBoundingClientRect === 'function' ? node.getBoundingClientRect().top : NaN;
  const travel =
    typeof innerHeight === 'number' && Number.isFinite(top) ? Math.min(full, Math.max(0, innerHeight - top)) : full;

  return {
    duration: motionDuration('--dur-med'),
    easing: EASE_OUT,
    /* `min-height: 0`, because a floor under the box would hold it open: a card tile
       carries min-height 176px (kit.css, so a widening card holds still) and its height
       travel went nowhere - the box stood at full size from the first frame and the rows
       under it teleported. The animated height is the box's whole size for the travel. */
    css: (t) =>
      `overflow: hidden;` +
      `min-height: 0;` +
      (rows ? `grid-template-rows: ${rows};` : '') +
      `height: ${t >= 1 ? full : t * travel}px;` +
      `padding-top: ${t * paddingTop}px;` +
      `padding-bottom: ${t * paddingBottom}px;` +
      `border-top-width: ${fadeEdges || t >= 1 ? borderTop : 0}px;` +
      `border-bottom-width: ${fadeEdges || t >= 1 ? borderBottom : 0}px;` +
      `margin-top: ${t * (marginTop - swallowed)}px;` +
      /* With its edges kept for the fade, the box cannot shrink below its
         own two hairlines: a notice sat at 2px for the last 150ms of the
         close and gave them back in the frame it was removed (pre-release
         18, item 53). The margin under it takes those pixels back over the
         travel instead, so the neighbours arrive where the removal leaves
         them. */
      `margin-bottom: ${restMargin + t * (marginBottom - restMargin) - (fadeEdges ? (1 - t) * (borderTop + borderBottom) : 0)}px;` +
      (fadeEdges ? `opacity: ${Number(Math.min(1, t / EDGES_GONE_OVER).toFixed(3))};` : '')
  };
}

/**
 * Tier 3, change within a screen: an inline element or pill opening its own
 * width rather than cutting into or out of a row.
 *
 * Horizontal sibling to `disclose`. Where `disclose` animates height for
 * block containers, `discloseWidth` animates width for inline and flex items
 * (such as the "Hidden" tag indicator on settings rows), so their appearance
 * or departure fades and collapses smoothly without dropping abruptly from
 * full opacity or causing adjacent row contents to jump.
 *
 * Reduced motion is an instant cut, which is tier 3's substitute.
 */
export function discloseWidth(node: Element, params: { instant?: boolean } = {}): TransitionConfig {
  if (params.instant || isReducedMotion() || typeof getComputedStyle === 'undefined') return { duration: 0 };

  const style = getComputedStyle(node);
  const rect = typeof node.getBoundingClientRect === 'function' ? node.getBoundingClientRect() : null;
  const width = rect?.width || parseFloat(style.width) || 0;

  const parent = node.parentElement;
  const parentStyle = parent && typeof getComputedStyle === 'function' ? getComputedStyle(parent) : null;
  const gap = node.previousElementSibling && parentStyle ? parseFloat(parentStyle.columnGap) || 0 : 0;

  return {
    duration: motionDuration('--dur-fast'),
    easing: EASE_OUT,
    css: (t, u) =>
      `overflow: hidden;` +
      `white-space: nowrap;` +
      `opacity: ${t};` +
      `min-width: 0;` +
      `max-width: ${t * width}px;` +
      `width: ${t * width}px;` +
      (gap ? `margin-inline-start: ${-u * gap}px;` : '')
  };
}

/** The last share of a closing panel's travel over which it fades, hairlines
    and all: with the edges kept for the travel, this is what takes the last
    device pixel of a line away without a frame in which it vanishes. */
const EDGES_GONE_OVER = 0.35;

/** The top margin of a box's first child that collapses through the box's
    own top edge at rest: block flow, nothing between the two edges
    (no padding or border on top), and a box that is not already a
    formatting context. Zero anywhere else. */
function collapsedTopMargin(node: Element, style: CSSStyleDeclaration): number {
  const parent = node.parentElement;
  if (!parent || /flex|grid/.test(getComputedStyle(parent).display ?? '')) return 0;
  if ((style.overflow ?? 'visible') !== 'visible') return 0;
  if ((parseFloat(style.paddingTop) || 0) > 0 || (parseFloat(style.borderTopWidth) || 0) > 0) return 0;
  const first = node.firstElementChild;
  return first ? parseFloat(getComputedStyle(first).marginTop) || 0 : 0;
}

/**
 * Bring a panel down from behind the element above it. Keep its
 * full height. Use a negative top margin and clip the part that
 * has yet to arrive. The lower edge appears first while surrounding
 * rows give it space progressively.
 *
 * The margin is the layout property animated here. collapse has
 * already cut this path for reduced motion.
 */
function arrivesFromAbove(node: Element): TransitionConfig {
  const style = getComputedStyle(node);
  const height = parseFloat(style.height) || 0;
  const replaced = surfaceItReplaces(node);
  const marginTop = parseFloat((replaced ? getComputedStyle(replaced) : style).marginTop) || 0;
  const marginBottom = parseFloat(style.marginBottom) || 0;
  /* The margin under the block grows with it from where the neighbours
     were meeting, the same arithmetic `disclose` uses on the way out: a
     block arriving at full margin pushed the list under it 20px in its
     first frame (the Transition door's search results wrapper, empty and
     margined, on the keystroke). */
  const restMargin = restingMarginBelow(node);
  return {
    duration: motionDuration('--dur-slow'),
    easing: EASE_OUT,
    tick: gapItOpens(node),
    css: (t, u) =>
      `clip-path: inset(${u * height}px 0 0 0);` +
      `margin-top: ${marginTop - u * height}px;` +
      `margin-bottom: ${restMargin + t * (marginBottom - restMargin)}px;`
  };
}

/** A block arriving on a line of its own in a flex or grid parent opens a
    row gap there, and no margin of its own can take that back: a line's
    size is floored at zero, so the gap lands whole in the first frame (a
    tile promoted onto a new line of Home's tile grid, 8px under Pinned in
    one frame - pre-release 18, item 53). The parent's own bottom margin
    takes the gap instead and gives it back on the arrival's curve, frame
    by frame, and is handed back untouched at the end. Nothing to do where
    the parent is not a flex or grid box, has no row gap, or has nothing
    else in it to stand a gap away from. */
function gapItOpens(node: Element): TransitionConfig['tick'] {
  const parent = node.parentElement;
  if (!parent || typeof getComputedStyle !== 'function') return undefined;
  const style = getComputedStyle(parent);
  if (!/flex|grid/.test(style.display ?? '')) return undefined;
  const gap = parseFloat(style.rowGap ?? '') || 0;
  if (gap <= 0 || parent.children.length < 2) return undefined;
  const resting = parseFloat(style.marginBottom) || 0;
  const inline = parent.style.marginBottom;
  return (t, u) => {
    parent.style.marginBottom = t >= 1 ? inline : `${resting - u * gap}px`;
  };
}

/** The kit surface on its way out that this one arrives directly behind,
    if any: one notice replacing another in the same spot. Svelte marks a node inert for its outro. While it leaves,
    the kit's surface-after-surface rule gives the arriving one a top margin
    that is gone the frame the leaving node is removed - 20px in one frame
    at the end of the swap. Once it stands in that place its margin is the
    one the leaving surface has there now, so that is where it ends. */
function surfaceItReplaces(node: Element): Element | null {
  const before = node.previousElementSibling as (Element & { inert?: boolean }) | null | undefined;
  const surface = (el: Element) => el.hasAttribute?.('data-kit-surface') === true;
  return before?.inert === true && surface(before) && surface(node) ? before : null;
}

/** How tall a panel may be and still arrive from above. A block does - a
    tile is 176px, a notice about 120 - and the travel is its own height. A
    list opens in place instead: the Transition door's index is some
    1500px, and a block that tall coming down from above is the whole door
    rushing past in 380ms. The line is a phone screen's half, which is
    where a block stops being a block a thumb can cover. */
const FROM_ABOVE_MAX = 400;

/** The margin `node`'s own margin meets on one side of it, as one number: the largest of
    the margins it collapses with at rest, or null where it meets none.

    Its sibling's facing margin where it has a sibling. Where it is the first or last child
    of a plain block wrapper - nothing on that edge to hold a margin in: no padding, no
    border, not a formatting context - its margin passes through the wrapper's edge,
    collapses with the wrapper's own margin on that edge, and goes on to meet the wrapper's
    sibling, however many such wrappers deep. Home's reserves (ReadReserve.svelte) put its
    notices one wrapper down from the blocks they close between; reading only siblings, the
    first notice found nothing above it and its margin ended 20px short. And a screen part's
    last row meets the part's own 20 on the way down, whatever is under it. */
function meetingMargin(node: Element, side: 'prev' | 'next'): number | null {
  const facing = side === 'prev' ? 'marginBottom' : 'marginTop';
  const own = side === 'prev' ? 'marginTop' : 'marginBottom';
  let at: Element = node;
  let met: number | null = null;
  for (;;) {
    const sibling = side === 'prev' ? at.previousElementSibling : at.nextElementSibling;
    if (sibling) {
      const style = getComputedStyle(sibling);
      /* Below, the sibling's own first child can bring a top margin through
         the sibling's bare top edge, and that is the margin met (pre-release
         18, item 71: the roadmap's Social heading's 16px under the pack
         closing with the Polish steps - read as 0, the pack's margin ended
         16px short and the Social group rose 16px in the frame of removal). */
      const through = side === 'next' ? collapsedTopMargin(sibling, style) : 0;
      return Math.max(met ?? 0, parseFloat(style[facing]) || 0, through);
    }
    const wrapper = at.parentElement;
    if (!wrapper || !marginPassesThrough(wrapper, side)) return met;
    const edge = parseFloat(getComputedStyle(wrapper)[own]) || 0;
    if (edge > 0) met = Math.max(met ?? 0, edge);
    at = wrapper;
  }
}

function marginPassesThrough(wrapper: Element, side: 'prev' | 'next'): boolean {
  const style = getComputedStyle(wrapper);
  const edge = side === 'prev' ? 'Top' : 'Bottom';
  return (
    style.display === 'block' &&
    (style.overflow ?? 'visible') === 'visible' &&
    !parseFloat(style[`padding${edge}`] ?? '0') &&
    !parseFloat(style[`border${edge}Width`] ?? '0')
  );
}

/** Where a collapsing or arriving box's bottom margin ends in block flow.

    An open box with `overflow: hidden` or content is a formatting context, so the margins
    on either side of it are both spent; the frame it is absent they collapse into the
    larger. The margin therefore has to end at minus the smaller neighbour, which is exactly
    what collapsing takes away - 20 + 0 + (40 - 20) = 40 - or the page takes that difference
    in one frame. Zero inside a flex or grid parent, where margins never collapse, and zero
    without a neighbour on each side to collapse between. */
function restingMarginBelow(node: Element): number {
  const parent = node.parentElement;
  const flow = parent ? !/flex|grid/.test(getComputedStyle(parent).display ?? '') : false;
  const above = meetingMargin(node, 'prev');
  const below = meetingMargin(node, 'next');
  if (!flow || above === null || below === null) return 0;
  return -Math.min(above, below);
}


/** A box in viewport coordinates: where a panel stood. */
type Slot = { top: number; left: number; width: number; height: number };

/** A swap, as the two boxes it happens between: the slot the leaving panel
    holds, and where its replacement is coming from. */
export type Swap = { slot: Slot; from?: Slot };

/* When a grid last handed a leaving panel's slot straight to another one, as
   a `performance.now()` reading, and the boxes it happened between. See
   `collapse`. */
let replacedAt = -Infinity;
let replacedSwap: Swap | null = null;

/** Called by a screen whose list is swapping one panel for another in a
    single tick - a dismissal its fold fills at once - before the DOM is
    updated, with the box the leaving panel still occupies at that moment and,
    where the screen knows it, the box its replacement is coming out of.
    Measured there because a frame later the replacement is standing in the
    slot and the panel it replaced has been pushed elsewhere. See `collapse`. */
export function markSlotReplacement(swap: Swap | null, now: number = performance.now()): void {
  replacedAt = now;
  replacedSwap = swap;
}

/** Where a tile leaving along a row has finished taking its content out,
    as a fraction of its own width. Below this the surface travels empty. */
const CONTENT_GONE_AT = 0.35;

/** How long a swap stays true, in milliseconds. Not a token, because it is
    not a duration anybody sees: the signal only has to survive the flush that
    renders the swap, and both transitions are created microseconds after the
    screen marks it. Three frames of slack covers a slow flush without ever
    reaching the next change. */
const SWAP_WINDOW_MS = 50;

/* A window rather than a flag because the swap has two consumers - the panel
   leaving and the one taking its slot - and neither can be told which of them
   goes first. */
function replacingSlot(): boolean {
  return performance.now() - replacedAt < SWAP_WINDOW_MS;
}

/** Whether a sibling stands on a line below this node's own.

    A wrapping row can hand a panel's space to a tile from the line under it
    rather than to the one beside it, and that tile arrives by rewrapping,
    which is a jump nothing can animate. Asked so `collapse` can tell the two
    apart: space given back to a neighbour is worth animating, space a
    rewrap is about to claim is not. */
function hasLineBelow(node: Element): boolean {
  const parent = node.parentElement;
  const box = node.getBoundingClientRect();
  if (!parent || box.height <= 0) return false;
  for (const sibling of parent.children) {
    if (sibling === node) continue;
    if (sibling.getBoundingClientRect().top > box.top + box.height / 2) return true;
  }
  return false;
}

/**
 * Settle the grid when a dissolving tile leaves its slot. Measure
 * before and with that tile synchronously out of flow to capture
 * rewrapping and the height of any vacated row.
 *
 * Translate every moving tile back to its old position, then let it
 * travel at its new width. Keep vacated space as a margin below the
 * grid during travel. Fixing the grid's height would stretch the
 * remaining flex row.
 *
 * Use WAAPI for the tiles and margin so the panel's transition can
 * keep its own CSS. Normal geometry takes over when playback ends.
 */
function settleGrid(node: Element, duration: number): void {
  const parent = node.parentElement;
  const style = (node as HTMLElement).style;
  if (!parent || !style) return;

  const moving = [...parent.children].filter((child) => child !== node) as HTMLElement[];
  const before = moving.map((child) => child.getBoundingClientRect());
  const spaceBefore = parent.getBoundingClientRect().height;

  const display = style.display;
  style.display = 'none';
  const after = moving.map((child) => child.getBoundingClientRect());
  const spaceAfter = parent.getBoundingClientRect().height;
  style.display = display;

  const easing = EASE_OUT_CSS;
  moving.forEach((child, i) => {
    const dx = before[i].left - after[i].left;
    const dy = before[i].top - after[i].top;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
    child.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }], {
      duration,
      easing
    });
  });

  const going = spaceBefore - spaceAfter;
  if (going < 1) return;
  const base = parseFloat(getComputedStyle(parent).marginBottom) || 0;
  parent.animate([{ marginBottom: `${base + going}px` }, { marginBottom: `${base}px` }], {
    duration,
    easing
  });
}

/** The panel taking a slot over: it travels out of wherever it was promoted from and fades
    in as it goes.

    Two cards changing places in one slot is what a crossfade cannot say - "it looks fine
    as-is, but just the opacity animation can be confusing". What the arriving panel
    actually did is come out of the fold below the grid, and travelling from there says so:
    one card leaves, and the thing that was folded under the grid rises into its place.

    The travel is a transform, so nothing around it moves and the panel is laid out at its
    own size from the first frame - the same reason the tiles a rewrap moves do not animate
    their width. Without an origin, which is a screen that cannot say where the replacement
    came from, it is the fade alone. */
function risesIntoSlot(node: Element, from?: Slot): TransitionConfig {
  const duration = motionDuration('--dur-slow');
  const here = node.getBoundingClientRect();
  const dx = from ? from.left - here.left : 0;
  const dy = from ? from.top - here.top : 0;
  if (!from || (Math.abs(dx) < 1 && Math.abs(dy) < 1)) {
    return { duration, easing: EASE_OUT, css: (t) => `opacity: ${t}` };
  }
  return {
    duration,
    easing: EASE_OUT,
    css: (t, u) => `opacity: ${t};` + `transform: translate(${u * dx}px, ${u * dy}px);`
  };
}

/** Whether `node` is standing over more than half of `slot`'s height. */
function standsInSlot(node: Element, slot?: Slot): boolean {
  if (!slot) return false;
  const here = node.getBoundingClientRect();
  const overlap = Math.min(here.top + here.height, slot.top + slot.height) - Math.max(here.top, slot.top);
  return overlap > Math.min(here.height, slot.height) / 2;
}

/** A panel that is not giving its space back: it leaves the flow in the frame it is
    dismissed and dissolves where it stood.

    Pinned to the box rather than left in place, and the pinning is the whole point - out of
    flow, the grid reaches its final layout in the frame of the tap, so nothing grows into
    space that is about to be reclaimed and nothing snaps back when the node is finally
    removed. `position: fixed` rather than absolute because the box is in viewport
    coordinates and no containing block has to be arranged for it.

    --dur-slow, and it starts the same frame as the arriving panel's own fade, so a swap
    reads as one card dissolving into another rather than as a hole that fills in
    afterwards. */
function dissolveAt(slot: Slot): TransitionConfig {
  return {
    duration: motionDuration('--dur-slow'),
    easing: EASE_OUT,
    css: (t) =>
      `position: fixed;` +
      `top: ${slot.top}px;` +
      `left: ${slot.left}px;` +
      `width: ${slot.width}px;` +
      `height: ${slot.height}px;` +
      `margin: 0;` +
      `z-index: 2;` +
      `pointer-events: none;` +
      `opacity: ${t};`
  };
}

/** Whether anything else in this node's parent stands on the same line.

    More than half of this node's own height has to overlap, so a tile beside
    it counts and the row above it does not. Asked of the live layout rather
    than of a prop, which is what lets one call site cover both a pair side by
    side and the same pair stacked below the 390px floor. */
function sharesItsLine(node: Element): boolean {
  const parent = node.parentElement;
  const box = node.getBoundingClientRect();
  if (!parent || box.height <= 0) return false;
  for (const sibling of parent.children) {
    if (sibling === node) continue;
    const position = getComputedStyle(sibling).position;
    if (position === 'absolute' || position === 'fixed') continue;
    const other = sibling.getBoundingClientRect();
    const overlap = Math.min(box.bottom, other.bottom) - Math.max(box.top, other.top);
    if (overlap > box.height / 2) return true;
  }
  return false;
}

/**
 * Release a panel's space on the current layout axis. Fix a horizontal
 * panel's width so siblings can grow during its exit. Use disclose when stacked.
 * markSlotReplacement tells a capped grid to fill a slot without collapsing
 * an extra row. Enter and leave cut during screen arrival. A caller can also
 * pass skip. For stacked replacements, after (ms) holds the entering panel at zero
 * until the exit has collapsed.
 */
export function collapse(
  node: Element,
  params?: { skip?: boolean; after?: number },
  options?: { direction?: 'in' | 'out' | 'both' }
): TransitionConfig {
  /* Every caller reaches this through `transition:`, which is bidirectional,
     and Svelte answers a bidirectional directive by calling the primitive
     once with direction 'both'. A primitive that behaves differently coming
     and going therefore has to hand back a function for Svelte to ask again
     when it knows which way this is - which it does at the moment the
     animation starts, so the measurements below still happen against the
     layout the transition is actually running on. Without this the two
     direction tests below are the only place the distinction existed: the
     arrival gate had never once suppressed an entrance. */
  if (options?.direction === 'both') {
    /* Cast because the shape is Svelte's own and svelte2tsx's shim cannot
       say it: the shim types the function form as nullary, and a signature
       that took the direction it is actually called with would fail every
       call site's type check instead. */
    return ((each?: { direction: 'in' | 'out' }) =>
      collapse(node, params, each)) as unknown as TransitionConfig;
  }
  if (isReducedMotion() || params?.skip) return { duration: 0 };
  /* A tile action can intentionally remove its own tile while Home is still
     settling. That is a dismissal, not read-driven displacement. */
  if (stillArriving()) {
    const element = node as HTMLElement;
    if (options?.direction !== 'out' || !element.hasAttribute('data-intentional-tile-exit')) {
      return { duration: 0 };
    }
    element.removeAttribute('data-intentional-tile-exit');
  }
  /* A panel arriving on a settled screen does not wait its turn in the grid's stagger
     (kit.css, --tile-index): the stagger is for a grid arriving together, and the third
     tile out of the fold sat as a blank block for its two steps before it clipped open.
     Inline, so the grid's own nth-child rule is overridden for this one element and nothing
     else. */
  if (options?.direction === 'in') (node as HTMLElement).style?.setProperty?.('--tile-index', '0');
  /* Only `data-live-tile` elements participate in keyed slot replacement. Home's `$effect.pre` uses the same marker to find the leaving tile's box. Its surrounding tier wrapper still needs to collapse in flow. Dissolving the wrapper during an unrelated swap pins it in place and makes the agenda jump under a tile still fading for 380ms. */
  if (replacingSlot() && (node as HTMLElement).hasAttribute('data-live-tile')) {
    /* Only an arrival that actually stands in the slot it replaces rises
       into it. Stopping the wear session in the today tier promotes the
       folded tile into the moment grid further down, on a line of its own:
       it is a tile arriving, not a swap, and faded in at full height it
       pushed Pinned down 128px in one frame (pre-release 18, item 53). */
    if (options?.direction === 'in' && standsInSlot(node, replacedSwap?.slot)) {
      return risesIntoSlot(node, replacedSwap?.from);
    }
  }
  if (
    replacingSlot() &&
    options?.direction !== 'in' &&
    (node as HTMLElement).hasAttribute('data-live-tile')
  ) {
    /* The screen measures the slot before the DOM changes; without one there
       is nothing to pin the panel to and the cut is the honest fallback. */
    return replacedSwap ? dissolveAt(replacedSwap.slot) : { duration: 0 };
  }
  /* The column case is `disclose`, on this primitive's own duration rather than
     `disclose`'s. A panel giving its space back is the largest layout change tier 3 makes
     and it reads as a yank at --dur-med; a group opening inside a screen, which is what
     `disclose`'s other callers are, has less to move and keeps the faster one. Both axes of
     a panel take the same duration, or closing the last of a pair would be slower than
     closing one of two. */
  if (!sharesItsLine(node)) {
    /* Arriving, the panel comes down from above (`arrivesFromAbove`); leaving, it gives its
       height back from the bottom up, which is `disclose` run backwards and the closing
       signed off. */
    if (options?.direction === 'in' && node.getBoundingClientRect().height <= FROM_ABOVE_MAX) {
      return { ...arrivesFromAbove(node), delay: params?.after ?? 0 };
    }
    /* A tall panel arriving opens in place with no fade; only a close fades
       its edges out. */
    return {
      ...disclose(node, params, { fadeEdges: options?.direction !== 'in' }),
      duration: motionDuration('--dur-slow')
    };
  }
  /* Something on the line below is about to rewrap into this space, so it is
     not being given back to the neighbour and the neighbour must not grow
     into it: measured at 700px with the fold open, the dose panel grew to
     638px and snapped back to 318px at 174ms of the travel, when the tile
     below fitted back onto the line. Dissolving instead settles the grid in
     the frame of the tap. The tile that moves up still moves in one frame -
     it changes place and width at once, which a transform cannot carry. */
  if (hasLineBelow(node)) {
    const dissolve = dissolveAt(node.getBoundingClientRect());
    settleGrid(node, dissolve.duration ?? 0);
    return dissolve;
  }

  const width = node.getBoundingClientRect().width;
  const gap = parseFloat(getComputedStyle(node.parentElement!).columnGap) || 0;
  /* The side padding travels with the width and the two vertical edges go on
     the first frame. A tile is a padded, bordered box under `box-sizing:
     border-box`, so a zero flex-basis still draws all of that: the safe-space
     card stalled at 34px - its own padding plus the room its close control
     keeps - for the last third of the travel and lost the rest in the frame
     the node was removed. This is `disclose`'s own treatment of the vertical
     padding and borders, turned ninety degrees; an edge is one pixel that
     reads as an edge or as a hairline artefact, so it is cut rather than
     thinned. */
  const style = getComputedStyle(node);
  const paddingLeft = parseFloat(style.paddingLeft) || 0;
  const paddingRight = parseFloat(style.paddingRight) || 0;
  const borderLeft = parseFloat(style.borderLeftWidth) || 0;
  const borderRight = parseFloat(style.borderRightWidth) || 0;

  return {
    duration: motionDuration('--dur-slow'),
    easing: EASE_OUT,
    /* Set min-width: 0 so a flexible row panel can shrink past its
       text's intrinsic width. Cancel the gap with a negative leading
       margin so the remaining panel lands at full width.

       Fade the contents before the panel reaches one third of its width,
       so the last frames show a clean surface instead of reflowing text.
       A vertical disclosure keeps each line at its normal width. */
    css: (t, u) =>
      `overflow: hidden;` +
      `min-width: 0;` +
      `flex: 0 0 ${t * width}px;` +
      `opacity: ${Number(Math.max(0, Math.min(1, (t - CONTENT_GONE_AT) / (1 - CONTENT_GONE_AT))).toFixed(3))};` +
      `padding-left: ${t * paddingLeft}px;` +
      `padding-right: ${t * paddingRight}px;` +
      `border-left-width: ${t >= 1 ? borderLeft : 0}px;` +
      `border-right-width: ${t >= 1 ? borderRight : 0}px;` +
      `margin-inline-start: ${-(u * gap)}px;`
  };
}

/**
 * Put out:crossfade on the skeleton and let the incoming content render
 * normally. A second entrance would replay the shell's arrival animation.
 *
 * Take the leaving node out of flow synchronously so it cannot push the
 * new content down for one frame. A position declared in css() would
 * start a frame later. Pin the node's measured width because absolute
 * positioning otherwise shrinks it to fit, and keep its static vertical
 * position. Set z-index: -1 so it paints behind the arriving content.
 *
 * Apply these inline styles only when leaving. Svelte also calls this
 * with direction 'both' for bidirectional transitions. An entering
 * clickable mark must keep its normal position and pointer events.
 * Reduced motion cuts the transition.
 */
export function crossfade(
  node: Element,
  params?: unknown,
  options?: { direction?: 'in' | 'out' | 'both' }
): TransitionConfig {
  if (options?.direction === 'both') {
    return ((each?: { direction: 'in' | 'out' }) =>
      crossfade(node, params, each)) as unknown as TransitionConfig;
  }

  const width = node.getBoundingClientRect().width;
  if (options?.direction !== 'in') {
    const style = (node as HTMLElement).style;
    if (style) {
      style.position = 'absolute';
      style.width = `${width}px`;
      style.zIndex = '-1';
      style.pointerEvents = 'none';
    }
    /* Named for the stylesheet, which cannot see the positioning above: a
       leaving node is still a DOM sibling for the length of its fade, so
       it still counts for `:first-child`. `.kit-heading:first-child`
       (kit.css) reads through it, so heading-led content does not lose
       24px of top margin in one frame when the skeleton is finally
       removed. */
    const data = (node as HTMLElement).dataset;
    if (data) data.leaving = '';
  }

  /* `{ instant: true }` for a placeholder that was never painted: a warm revisit replaces
     it in the flush that mounted it, and fading out something nobody saw would draw it for
     the first time, over the content, on its way out. */
  const instant = (params as { instant?: boolean } | undefined)?.instant === true;
  return {
    duration: instant ? 0 : motionDuration('--dur-fast'),
    easing: EASE_OUT,
    css: (t) => `opacity: ${t}`
  };
}

/**
 * Animate height when content changes inside a mounted box. Svelte's
 * transitions cover insertion and removal. This action watches ongoing
 * layout because CSS auto-height interpolation fails on the browser floor.
 *
 * ResizeObserver runs after layout and before paint. Start the WAAPI
 * animation in that callback so its first frame replaces the height jump.
 * Height animation is the layout exception that lets neighboring rows move
 * with the box. Use overflow: clip only during travel. Hidden would create
 * a formatting context and move collapsing child margins.
 *
 * Ignore observer callbacks during travel so the animation does not chase
 * its own frames. On completion, release the held height and remeasure. If
 * content changed, start from the prior animation's target and move to the
 * new height. Reduced motion applies the layout change immediately.
 */
/** Every scrolled ancestor of `node` with its scroll position, so a
    layout that briefly shortens the page can be undone before it paints. */
function scrollPositionsAbove(node: HTMLElement): Array<[Element, number]> {
  const found: Array<[Element, number]> = [];
  for (let el = node.parentElement; el; el = el.parentElement) {
    if (el.scrollTop > 0) found.push([el, el.scrollTop]);
  }
  return found;
}

/* The last scroll position each scroller reported, read before a layout
   clamps it. A scroll event fires in the frame after the scroll it reports,
   so when a box's observer runs, the position recorded here is still the one
   from before the layout that shortened the page. One listener for every
   `resize`, installed by the first. */
const lastScrollTop = new WeakMap<Element, number>();
let watchingScrolls = false;
function watchScrolls() {
  if (watchingScrolls || typeof document === 'undefined' || typeof document.addEventListener !== 'function') return;
  watchingScrolls = true;
  document.addEventListener('scroll', (event) => {
    const el = (event.target === document ? document.scrollingElement : event.target) as Element | null;
    if (typeof el?.scrollTop === 'number') lastScrollTop.set(el, el.scrollTop);
  }, { capture: true, passive: true });
}

/** Scrolled ancestors of `node` sitting at their end, shorter than the
    position they last reported: clamped by the layout that just shrank
    `node`, with the position to put back. */
function scrollPositionsClampedAbove(node: HTMLElement): Array<[Element, number]> {
  const found: Array<[Element, number]> = [];
  for (let el = node.parentElement; el; el = el.parentElement) {
    const before = lastScrollTop.get(el);
    if (before === undefined || before <= el.scrollTop + 0.5) continue;
    if (el.scrollTop >= el.scrollHeight - el.clientHeight - 1) found.push([el, before]);
  }
  return found;
}

function restoreScrollPositions(positions: Array<[Element, number]>) {
  for (const [el, top] of positions) {
    if (el.scrollTop !== top) el.scrollTop = top;
  }
}

export const resize: Action<HTMLElement, unknown> = (node) => {
  if (isReducedMotion() || typeof ResizeObserver === 'undefined') return;
  watchScrolls();

  /* Read when the box is first painted (below), not at mount: a mount-time
     read forced a layout inside whatever flush mounted the box. */
  let lastHeight = 0;
  let hidden = !isDoorActive(node);
  let animating = false;
  let destroyed = false;
  let current: Animation | undefined;
  /* A height the box reached before it was ever painted is where it starts, not a change:
     nobody saw the height it was mounted at. A warm revisit swaps a group's placeholder for
     its content in the flush that mounts it, and travelling from the placeholder's height
     moved every tile under the reading grid 850px across the tab's first 170ms. */
  let painted = typeof requestAnimationFrame !== 'function';
  if (painted) lastHeight = node.getBoundingClientRect().height;
  else requestAnimationFrame(() => {
    if (destroyed) return;
    setTimeout(() => {
      // The first observer notification can arrive after this paint. Start
      // from the visible height, not the box measured during its mount.
      if (destroyed) return;
      if (!isDoorActive(node)) { hidden = true; return; }
      lastHeight = node.getBoundingClientRect().height;
      painted = true;
    });
  });

  /* The tallest the box can be with its bottom edge still in the viewport.
     A travel is only worth watching while its edge is on screen, and the
     ease-out spends its first frame on the whole distance: the Journal's
     "Earlier entries" grew the gate by 972px, and 280px of that in the
     first frame took the button off the screen and painted the next day
     whole. So the animation runs between the two
     heights as the viewport sees them, and whatever lies past its bottom
     lands there unseen when the animation lets go. */
  const onScreen = (height: number) => {
    const top = node.getBoundingClientRect().top;
    if (typeof innerHeight !== 'number' || !Number.isFinite(top)) return height;
    return Math.min(height, Math.max(0, innerHeight - top));
  };

  /* The box held at a height, and what its own style said before the
     hold, so a hold taken again before a travel (to put a scroll position
     back, below) is never mistaken for the resting value. */
  let holding = false;
  let restoreOverflow = '';
  let restoreHeight = '';
  const hold = (height: number) => {
    if (!holding) {
      restoreOverflow = node.style.overflow;
      restoreHeight = node.style.height;
      holding = true;
    }
    node.style.overflow = 'clip';
    node.style.height = `${height}px`;
  };
  const release = () => {
    if (!holding) return;
    node.style.height = restoreHeight;
    node.style.overflow = restoreOverflow;
    holding = false;
  };

  const animateTo = (oldHeight: number, newHeight: number, heldAt?: number) => {
    const from = heldAt ?? onScreen(oldHeight);
    const to = onScreen(newHeight);
    if (Math.abs(to - from) < 1) {
      release();
      lastHeight = newHeight;
      return;
    }
    animating = true;
    // Android can paint before a pending Web Animation owns the height.
    // Its underlying box keeps the previous height until the handover.
    hold(from);
    const duration = readRevealDuration('--dur-med');
    /* A travel chained on from a finished one (heldAt, below) sets off
       from an edge that has come to rest, and --ease-out would spend 44% of
       it in the first frame: on a first door into the Journal the clamped
       edge stopped 85px short, then lunged 37px in one frame and uncovered
       the day's tag pills whole (carpet 15 row 51). --ease-out-soft is the
       curve for a travel setting off. */
    const easing = heldAt === undefined ? EASE_OUT_CSS : EASE_OUT_SOFT_CSS;
    current = node.animate(
      [{ height: `${from}px` }, { height: `${to}px` }],
      { duration, easing, fill: 'both' }
    );
    /* A box that empties, or fills from empty, also loses or gains its own
       bottom margin at one end of the travel. Empty
       and unclipped, its top and bottom margins collapse through it into
       its neighbours'; clipped for the travel, they do not. So the moment
       the clip came off a box that had travelled to nothing, everything
       under it went up by the screen's 20px in one frame - the look-back
       facts on a span too thin for them. The margin travels too, as a
       negative top margin that cancels the one above it, the same answer
       ReadReserve gives for its own swap. */
    const margin = typeof getComputedStyle === 'function' ? parseFloat(getComputedStyle(node).marginBottom) || 0 : 0;
    if (margin > 0 && (oldHeight < 1 || newHeight < 1)) {
      const open = { marginTop: '0px' };
      const shut = { marginTop: `${-margin}px` };
      node.animate(oldHeight < 1 ? [shut, open] : [open, shut], { duration, easing });
    }
    current.finished
      .catch(() => {
        // Cancelled below, by the node leaving mid-travel - `out:disclose`
        // (Notice.svelte) owns the height property from here, and finishing
        // quietly is what stops the two fighting over it.
      })
      .finally(() => {
        /* Releasing the hold to measure the content lays the box out at
           its real height, and a scroller whose end that box sits at
           clamps its scroll position to the shorter extent in that same
           layout. When the content shrank mid-travel, the second travel
           below then held the extent open again, but the scroll position
           had already gone: on Milestones, deleting a milestone with the
           page at its end moved the whole screen 210px in one frame at
           340ms (FA 46). So every scroll position above the box is read
           before the release and put back once the hold is on again, and
           the scroll then travels with the height frame by frame. */
        const scrolled = scrollPositionsAbove(node);
        release();
        current?.cancel();
        animating = false;
        current = undefined;
        if (destroyed) return;
        // With the held height and animation released, measure the content
        // again: a resize arriving mid-travel was ignored, not measured.
        // It may have changed the real height beyond this animation's target. A second block settling inside
        // the first one's 240ms used to land here as a silent snap - one
        // sibling-displacing frame with nothing chasing it; a caller with
        // several independently-settling children (a tile grid, a reading
        // grid) hits that far more than the single skeleton-to-content swap
        // this was written for, so the snap is chased as its own animation
        // instead of accepted.
        if (!isDoorActive(node)) { hidden = true; return; }
        const settled = node.getBoundingClientRect().height;
        if (hidden) { hidden = false; lastHeight = settled; return; }
        if (Math.abs(settled - newHeight) >= 1) {
          // Held again at the height the box was showing, then the scroll
          // positions back, then the travel from there: measured against
          // the restored scroll, so the far end is the one on screen.
          hold(to);
          restoreScrollPositions(scrolled);
          animateTo(newHeight, settled, to);
        } else if (onScreen(settled) - to >= 1) {
          /* The box rose while it travelled - a door's field settling
             above it - so the clamp taken at the start now stops short of
             the viewport's edge, and releasing would land the rest in one
             frame: the Journal's tag pills sat clipped 84px above the
             bottom for 100ms and then appeared whole (carpet 15 row 51).
             Travel on from the clamped edge to the one now on screen. */
          hold(to);
          restoreScrollPositions(scrolled);
          animateTo(newHeight, settled, to);
        } else {
          lastHeight = settled;
        }
      });
  };

  const changed = () => {
    if (destroyed) return;
    if (!isDoorActive(node)) {
      hidden = true;
      current?.cancel();
      return;
    }
    // The animation's own frames are themselves resizes; ignored rather than
    // measured, or the box would chase its own tail mid-travel. One that
    // lands while an animation is already running is picked up once that
    // animation's `finally` reads the node's real height, above.
    if (animating) return;

    const newHeight = node.getBoundingClientRect().height;
    const oldHeight = lastHeight;
    lastHeight = newHeight;
    if (hidden) { hidden = false; painted = true; return; }
    if (!painted) return;
    // Under a pixel is a rounding wobble, not a resize - animating one would
    // run a 240ms transition over nothing to look at.
    if (Math.abs(newHeight - oldHeight) < 1) return;

    /* The same clamp, one step earlier: the content shrank in the layout
       this observer reports from, so a scroller whose end the box sits at
       has already given up the difference before the travel holds the old
       height back. Closing Milestones' list at the page's end moved the
       screen 91px in that frame. The scroll position from before that
       layout is put back under the held height, and the travel from there
       measured against it. */
    if (newHeight < oldHeight) {
      const clamped = scrollPositionsClampedAbove(node);
      if (clamped.length) {
        hold(oldHeight);
        restoreScrollPositions(clamped);
      }
    }
    animateTo(oldHeight, newHeight);
  };
  const observer = new ResizeObserver(changed);
  observer.observe(node);

  return {
    // A read branch can resize in the DOM flush, before the browser paints
    // its new height. The observer still owns later content changes.
    update: changed,
    destroy() {
      destroyed = true;
      observer.disconnect();
      current?.cancel();
    }
  };
};

const masks = new WeakMap<HTMLElement, { count: number; overflow: string; rows: string }>();

/**
 * Animate a panel from its measured old height after relayout.
 * The caller captures that measurement before changing the layout
 * and supplies the easing used by the moving content. This is the
 * same one-height layout exception as disclose and resize.
 *
 * Pin grid tracks during travel so the panel reveals content at
 * its own size. Clear the clip and pinned tracks at rest so outlines
 * and focus rings can extend past the box. The caller checks reduced
 * motion and coordinates the motion of the inner marks.
 */
export function maskHeight(
  node: HTMLElement,
  from: number,
  duration: number,
  options: { signal?: AbortSignal; easing?: string } = {}
): Promise<void> {
  const { signal, easing = EASE_OUT_CSS } = options;
  /* A second travel can start inside the first (a month tapped twice). The
     box's own styles are saved once, by the first, and put back by the last
     to settle: saved per call, the second took the first's clip and pinned
     tracks for the box's own and left them on for good. Its tracks are
     unpinned before they are read, so they are the new layout's. */
  let held = masks.get(node);
  if (!held) {
    held = { count: 0, overflow: node.style.overflow, rows: node.style.gridTemplateRows };
    masks.set(node, held);
  }
  const own = held;
  own.count++;
  node.style.overflow = 'clip';
  node.style.gridTemplateRows = own.rows;
  node.style.gridTemplateRows = getComputedStyle(node).gridTemplateRows;
  const settle = () => {
    signal?.removeEventListener('abort', cancel);
    if (--own.count > 0) return;
    masks.delete(node);
    node.style.overflow = own.overflow;
    node.style.gridTemplateRows = own.rows;
  };
  const animation = node
    .animate([{ height: `${from}px` }, { height: `${node.getBoundingClientRect().height}px` }], {
      duration,
      easing
    });
  const cancel = () => animation.cancel();
  const settled = animation.finished.then(settle, settle);
  signal?.addEventListener('abort', cancel, { once: true });
  if (signal?.aborted) cancel();
  return settled;
}

/**
 * Tier 3, change within a screen: an empty-state monit or notice slides into view
 * with a smooth ease-out transition and soft opacity fade.
 *
 * Sized to the element's laid-out height with `min-height: 0`, so a floor on the
 * component (.kit-chart-empty carries min-height 88px) does not hold it open.
 * Unfolds height, fades opacity, and slides down slightly into resting position.
 */
export function slideMonit(
  node: Element,
  params?: { duration?: number; skip?: boolean }
): TransitionConfig {
  if (isReducedMotion() || params?.skip || typeof getComputedStyle === 'undefined') return { duration: 0 };

  const style = getComputedStyle(node);
  const height = parseFloat(style.height) || 0;
  const paddingTop = parseFloat(style.paddingTop) || 0;
  const paddingBottom = parseFloat(style.paddingBottom) || 0;
  const marginTop = parseFloat(style.marginTop) || 0;
  const marginBottom = parseFloat(style.marginBottom) || 0;
  const duration = params?.duration ?? motionDuration('--dur-slow');

  return {
    duration,
    easing: EASE_OUT,
    css: (t, u) =>
      `overflow: hidden;` +
      `min-height: 0;` +
      `height: ${t * height}px;` +
      `padding-top: ${t * paddingTop}px;` +
      `padding-bottom: ${t * paddingBottom}px;` +
      `margin-top: ${t * marginTop}px;` +
      `margin-bottom: ${t * marginBottom}px;` +
      `opacity: ${t};` +
      `transform: translateY(${u * -10}px);`
  };
}

