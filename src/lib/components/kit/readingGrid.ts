/* How a reading tile joins and leaves the Look back door's grid, and how the
   tiles around it get to their new cells (ux-carpet ticket 196).

   Dragging the span changes which readings have anything to say, so tiles
   come and go and every tile after them changes cell. Through `collapse`,
   each leaving tile settled the grid on its own, measuring it with only
   itself taken out: a span that emptied six readings at once sent the
   survivors 340px off either side of the screen, and before that fix a
   stale `skip` had them all leave in one frame with the rest snapping into
   place. The grid is the one thing that knows every cell, so it does the
   travel:

   - A leaving tile is lifted out of flow where it stands (`gridCell`) and
     fades there. Written to the node's style directly, the way `crossfade`
     does it (ticket 153), so no frame has it in flow and out of place.
   - An arriving tile fades in at its cell.
   - After any change to the set, and any change to the grid's size, every
     tile still in the grid that is not where it was travels there from
     where it was last painted (`settleCells`, a FLIP), including a tile
     already in the middle of an earlier travel.

   The column a tile sits in is written onto it here (`data-col`,
   `data-below`) rather than read off `:nth-child`, because a leaving tile is
   still a child for as long as it fades and would push every rule after it
   one place along. */
import type { Action } from 'svelte/action';
import type { TransitionConfig } from 'svelte/transition';
import { stillArriving } from '../../motion/screenArrival';
import { EASE_OUT, EASE_OUT_CSS, isReducedMotion, motionDuration } from '../../motion/tokens';

/** Which column each of `count` live cells sits in, and whether it is below
    the first row. */
export function cellPlaces(count: number, cols: number): Array<{ col: number; below: boolean }> {
  const per = Math.max(1, cols);
  return Array.from({ length: count }, (_, i) => ({ col: i % per, below: i >= per }));
}

/* Where each live cell was laid out the last time the grid settled, inside
   its padding box. A tile leaving in the same flush as others is already
   reflowed into their room by the time its own transition is asked, so
   this, not its current layout, is where it was last on screen. */
const lastPlace = new WeakMap<Element, { x: number; y: number }>();

const leaving = (node: Element) => (node as HTMLElement).dataset.leaving !== undefined;

/** Where a cell is painted inside the grid's padding box right now, running
    travel included. */
function paintedAt(cell: HTMLElement, grid: HTMLElement): { x: number; y: number } {
  const box = cell.getBoundingClientRect();
  const frame = grid.getBoundingClientRect();
  return { x: box.left - frame.left - grid.clientLeft, y: box.top - frame.top - grid.clientTop };
}

/** The transition for a tile in the grid: fade in at its cell, or lift out
    of flow where it is painted and fade there. */
export function gridCell(
  node: Element,
  params?: { skip?: boolean },
  options?: { direction?: 'in' | 'out' | 'both' }
): TransitionConfig {
  /* Svelte asks a bidirectional directive once with 'both'; answering with
     a function has it ask again with the real direction (see `collapse`). */
  if (options?.direction === 'both') {
    return ((each?: { direction: 'in' | 'out' }) => gridCell(node, params, each)) as unknown as TransitionConfig;
  }
  if (isReducedMotion() || params?.skip || stillArriving()) return { duration: 0 };
  const cell = node as HTMLElement;
  const grid = cell.parentElement;
  if (options?.direction === 'out' && grid) {
    const painted = paintedAt(cell, grid);
    const laid = lastPlace.get(cell) ?? { x: cell.offsetLeft, y: cell.offsetTop };
    const at = { x: laid.x + painted.x - cell.offsetLeft, y: laid.y + painted.y - cell.offsetTop };
    const { offsetWidth, offsetHeight } = cell;
    for (const travel of cell.getAnimations()) travel.cancel();
    Object.assign(cell.style, {
      position: 'absolute',
      left: `${at.x}px`,
      top: `${at.y}px`,
      width: `${offsetWidth}px`,
      height: `${offsetHeight}px`,
      margin: '0',
      pointerEvents: 'none'
    });
    cell.dataset.leaving = '';
  }
  return { duration: motionDuration('--dur-med'), easing: EASE_OUT, css: (t) => `opacity: ${t}` };
}

/** On the grid: keeps each live tile's column marks current and carries
    every tile that changes cell to its new one. */
export const settleCells: Action<HTMLElement> = (grid) => {
  const last = lastPlace;

  const settle = () => {
    const cells = ([...grid.children] as HTMLElement[]).filter((cell) => !leaving(cell));
    const cols = getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length || 1;
    grid.dataset.cols = String(cols);
    cellPlaces(cells.length, cols).forEach((place, i) => {
      cells[i].dataset.col = String(place.col);
      if (place.below) cells[i].dataset.below = '';
      else delete cells[i].dataset.below;
    });

    const animate = !isReducedMotion() && !stillArriving();
    const duration = motionDuration('--dur-med');
    for (const cell of cells) {
      const now = { x: cell.offsetLeft, y: cell.offsetTop };
      const was = last.get(cell);
      last.set(cell, now);
      /* Nothing to do for a tile whose cell did not change - most calls,
         since a count ticking inside a tile is a mutation too - and a
         travel already under way is left to finish. */
      if (!was || !animate || (Math.abs(was.x - now.x) < 1 && Math.abs(was.y - now.y) < 1)) continue;
      /* From where it is painted, not where it was laid out: a tile halfway
         through an earlier travel starts the next one from there. */
      const painted = paintedAt(cell, grid);
      const dx = was.x + (painted.x - now.x) - now.x;
      const dy = was.y + (painted.y - now.y) - now.y;
      for (const travel of cell.getAnimations()) if (travel.id === 'cell-travel') travel.cancel();
      const travel = cell.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], {
        duration,
        easing: EASE_OUT_CSS
      });
      travel.id = 'cell-travel';
    }
  };

  settle();
  const mutations = new MutationObserver(settle);
  mutations.observe(grid, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-leaving'] });
  const resizes = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(settle);
  resizes?.observe(grid);
  return {
    destroy() {
      mutations.disconnect();
      resizes?.disconnect();
    }
  };
};
