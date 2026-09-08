/* A set of things that stays the same set and changes shape (phase 10
   redesign ticket 10).

   The Journal door draws its month twice: as a strip of thin bars under the
   header, and - when somebody opens it - as the heat map's seven-column
   grid. The two are the same thirty days. Swapping one for the other is a
   cut, and a cut here is the exact thing DIRECTION.md's motion brief rules
   out: a month does not stop existing and a different month appear, it
   opens.

   So each day travels from where it stood to where it now stands. The
   arithmetic is FLIP's: measure before, let the layout change, measure
   again, then start every cell at the difference and release it. What is
   here is the difference only - the measuring and the animating need a DOM
   and live in the screen, the same division indicator.ts keeps with
   AppNav.svelte.

   Scale rather than width and height, because a cell going from 8x24 to
   40x40 is a compositor's job: a transform costs nothing per frame, and
   animating the box would relay out the grid thirty times a frame. It does
   mean a cell's 1px edge and its 2px corner ride the scale on the way,
   which at these sizes is a pixel of softness for the length of the travel
   and nothing at rest. */

export interface CellBox {
  /** The day this cell is, so the two measurements can be paired. Cells
      come and go between the two layouts - the strip draws no blanks and
      the grid does - and a pair is what makes a travel. */
  key: string | number;
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface CellStep {
  key: string | number;
  /** Where the cell begins, relative to where it now is. */
  dx: number;
  dy: number;
  /** How big it begins, as a fraction of the size it now has. */
  sx: number;
  sy: number;
}

/** Under a pixel is not a move. A fractional device pixel ratio lands a
    layout a third of a pixel either side of where it landed last time, and
    animating that is a repaint saying nothing (indicator.ts holds the same
    floor for the same reason). */
const MOVED = 1;
/** And under a hundredth is not a resize: 40px against 39.6px. */
const RESIZED = 0.01;

export function regroupSteps(before: CellBox[], after: CellBox[]): CellStep[] {
  const was = new Map(before.map((cell) => [cell.key, cell]));
  const steps: CellStep[] = [];
  for (const now of after) {
    const then = was.get(now.key);
    /* A cell with no width has not been laid out - measured inside a
       collapsed ancestor, or before the first frame - and a scale off it
       would be an Infinity handed to the compositor. */
    if (!then || !then.width || !then.height || !now.width || !now.height) continue;
    const dx = then.left - now.left;
    const dy = then.top - now.top;
    const sx = then.width / now.width;
    const sy = then.height / now.height;
    if (
      Math.abs(dx) < MOVED &&
      Math.abs(dy) < MOVED &&
      Math.abs(sx - 1) < RESIZED &&
      Math.abs(sy - 1) < RESIZED
    ) {
      continue;
    }
    steps.push({ key: now.key, dx, dy, sx, sy });
  }
  return steps;
}
