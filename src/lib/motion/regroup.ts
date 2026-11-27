/* Regroup the Journal's month strip into a grid without cutting between
   two views of the same days. The screen measures cells before and after
   layout and runs the FLIP animation. This module computes the transform.
   Scaling an 8×24 cell to 40×40 keeps each frame off the layout thread.
   The 1px edge and 2px corners scale during travel and settle at rest. */

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
