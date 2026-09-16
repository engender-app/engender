/* Narrowing a grid by a chip: the tiles that stay travel, the tiles that go
   leave the flow where they stood (phase 11 ticket 14, ADR-0078).

   Two grids ask for this - the photo library's and the journey export's -
   and they ask for the same three frames. Tapping "Hair" over a grid of
   twenty-one photographs is a state change, so it moves: the hair
   photographs that were scattered through the grid walk to the front of
   it, and the rest fade out of where they were standing rather than
   blinking away underneath them.

   THE ORDER MATTERS, and it is the reason this is a module rather than two
   lines in each screen. A tile removed from a keyed `{#each}` keeps its
   box for the length of its own outro, so the grid does not rewrap until
   the fade is over - and then it rewraps in one frame, which is the yank
   the animation was supposed to prevent. So the leaving tile is pinned out
   of the flow in the frame it leaves (`pinnedOut`, the same trick
   reveal.ts's `dissolveAt` plays for a dismissed panel), the grid reaches
   its final layout immediately, and the survivors are walked back to where
   they stood and released (`travelCells`, the FLIP arithmetic
   regroup.ts already holds).

   Transform and opacity only, per materials.css: a grid of a hundred
   thumbnails cannot afford a layout property per frame on a mid-range
   phone. */

import type { TransitionConfig } from 'svelte/transition';
import { EASE_OUT_CSS, isReducedMotion, motionDuration } from './tokens';
import { regroupSteps, type CellBox } from './regroup';

/** Where each cell of a grid stands, keyed by the attribute that names it.
    Taken before the list changes, handed to `travelCells` after. */
export function measureCells(root: HTMLElement | undefined, attribute: string): CellBox[] {
  if (!root) return [];
  return [...root.querySelectorAll<HTMLElement>(`[${attribute}]`)].map((cell) => {
    const box = cell.getBoundingClientRect();
    return {
      key: cell.getAttribute(attribute)!,
      left: box.left,
      top: box.top,
      width: box.width,
      height: box.height
    };
  });
}

/** Walks every cell that is still drawn back to where it stood and releases
    it. Call after the list has changed and the DOM has caught up (`await
    tick()`), with the boxes `measureCells` took before.

    WAAPI rather than an inline transition, for the reason settleGrid
    (reveal.ts) gives: the cell's own `:active` press and its outline are
    CSS, and an animation that finishes leaves nothing behind on the style
    attribute to interfere with either.

    The travel is translate only. A cell's size does not change when a grid
    narrows - `grid-template-columns` is the same track list either way -
    and scaling a photograph on the way would soften it for the length of
    the move. */
export function travelCells(before: CellBox[], root: HTMLElement | undefined, attribute: string): void {
  if (!root || isReducedMotion()) return;
  const cells = new Map(
    [...root.querySelectorAll<HTMLElement>(`[${attribute}]`)].map((cell) => [
      cell.getAttribute(attribute)!,
      cell
    ])
  );
  const duration = motionDuration('--dur-med');
  for (const step of regroupSteps(before, measureCells(root, attribute))) {
    const cell = cells.get(String(step.key));
    cell?.animate(
      [
        { transform: `translate(${step.dx}px, ${step.dy}px)` },
        { transform: 'translate(0, 0)' }
      ],
      { duration, easing: EASE_OUT_CSS }
    );
  }
}

/** A tile that a chip has narrowed away: it leaves the flow in the frame it
    is dropped and fades where it stood.

    Absolute rather than `dissolveAt`'s fixed, because a grid can be
    scrolled while it narrows and a fixed box would sit still against a
    moving page. The grid is the containing block, so any caller of this
    owes its grid a `position: relative` - `.photo-grid` has one
    (screens.css).

    Read before the pin, since `offsetTop` of a node that is already out of
    the flow is measured against a layout that no longer holds it. */
export function pinnedOut(node: Element): TransitionConfig {
  const cell = node as HTMLElement;
  const top = cell.offsetTop;
  const left = cell.offsetLeft;
  const width = cell.offsetWidth;
  const height = cell.offsetHeight;
  return {
    duration: motionDuration('--dur-fast'),
    css: (t) =>
      `position: absolute;` +
      `top: ${top}px;` +
      `left: ${left}px;` +
      `width: ${width}px;` +
      `height: ${height}px;` +
      `margin: 0;` +
      `pointer-events: none;` +
      `opacity: ${t};` +
      `transform: scale(${0.94 + 0.06 * t});`
  };
}

/** A tile arriving because a chip widened, or because a live query added a
    photograph while somebody was looking at the grid.

    Gated on `when`, and the gate is the point. A screen's content gets no
    entrance of its own on the way in: the skeleton fades out over it and a
    second fade a moment later is the content arriving twice
    (tests/feature-screens.test.ts, DIRECTION.md tier 3). So a caller passes
    false for the tiles that come with the grid and true for every tile
    after that, which it knows from whether its own grid has been painted
    yet.

    The duration token is clamped to 1ms under reduced motion by the theme,
    which is the instant cut this owes that setting. */
export function tileIn(_node: Element, params: { when: boolean }): TransitionConfig {
  if (!params.when) return { duration: 0 };
  return {
    duration: motionDuration('--dur-fast'),
    css: (t) => `opacity: ${t}; transform: scale(${0.94 + 0.06 * t});`
  };
}
