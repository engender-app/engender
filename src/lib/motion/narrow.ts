/* When a photo filter changes, pin outgoing tiles out of flow before their
   outros. A keyed each block otherwise keeps their boxes until the fade
   ends, then reflows in one frame. Once the grid settles, travelCells
   uses regroup.ts's FLIP to bring survivors from their old positions.

   Use transform and opacity only so large grids avoid layout work each
   frame. See materials.css. */

import type { TransitionConfig } from 'svelte/transition';
import { crossfadeDuration, EASE_OUT_CSS, isReducedMotion, motionDuration } from './tokens';
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

/** What stands under a narrowing grid: the "more" button and the links
    after it. The grid reaches its new height in the frame the chip is
    pressed, so without this they sit at their new place in that frame
    (carpet 15 row 49: Starred brought "Make a collage or timelapse" up
    from below the fold over the leaving tiles in one frame). Measured with
    the cells, before the list changes. */
export function measureFollowers(scope: HTMLElement | undefined): Map<HTMLElement, number> {
  const tops = new Map<HTMLElement, number>();
  for (const node of scope?.querySelectorAll<HTMLElement>('[data-narrow-follow]') ?? []) {
    tops.set(node, node.getBoundingClientRect().top);
  }
  return tops;
}

/** Walks each follower from where it stood to where it stands now, in the
    same frame and over the same duration as `travelCells`. One that stood
    below the screen starts at the screen's bottom edge rather than its old
    place, so it travels only what the viewport shows; one that is below the
    screen both before and after does not move at all. */
export function travelFollowers(before: Map<HTMLElement, number>): void {
  if (isReducedMotion() || typeof innerHeight !== 'number') return;
  const duration = motionDuration('--dur-med');
  for (const [node, top] of before) {
    if (!node.isConnected) continue;
    const now = node.getBoundingClientRect().top;
    if (top >= innerHeight && now >= innerHeight) continue;
    const dy = Math.min(top, innerHeight) - now;
    if (Math.abs(dy) < 1) continue;
    node.animate([{ transform: `translateY(${dy}px)` }, { transform: 'translateY(0)' }], {
      duration,
      easing: EASE_OUT_CSS
    });
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
export function pinnedOut(node: Element, { opacityOnly = false } = {}): TransitionConfig {
  const cell = node as HTMLElement;
  const top = cell.offsetTop;
  const left = cell.offsetLeft;
  const width = cell.offsetWidth;
  const height = cell.offsetHeight;
  return {
    duration: opacityOnly ? crossfadeDuration() : motionDuration('--dur-fast'),
    css: (t) =>
      `position: absolute;` +
      `top: ${top}px;` +
      `left: ${left}px;` +
      `width: ${width}px;` +
      `height: ${height}px;` +
      `margin: 0;` +
      `pointer-events: none;` +
      `opacity: ${t};` +
      (opacityOnly ? '' : `transform: scale(${0.94 + 0.06 * t});`)
  };
}

/** A tile arriving because a chip widened, or because a live query added a
    photograph while somebody was looking at the grid.

    Gated on `when`, and the gate is the point. A screen's content gets no
    entrance of its own on the way in: the skeleton fades out over it and a
    second fade a moment later is the content arriving twice
    (tests/node/ui/feature-screens.test.ts). Pass
    false for the tiles that come with the grid and true for every tile
    after that, which it knows from whether its own grid has been painted
    yet.

    `motionDuration` returns 0 under reduced motion, which is the instant cut
    this owes that setting. */
export function tileIn(_node: Element, params: { when: boolean }): TransitionConfig {
  if (!params.when) return { duration: 0 };
  return {
    duration: motionDuration('--dur-fast'),
    css: (t) => `opacity: ${t}; transform: scale(${0.94 + 0.06 * t});`
  };
}
