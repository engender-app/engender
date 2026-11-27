/* Check optical centring in the 24-unit view box. The optical centre
   averages the ink bounds' centre and the arc-length-weighted centroid.
   Bounds capture the reach of a thin pole or tail. The centroid accounts
   for the weight of a flag or arrowhead. The result must lie within 0.5
   units of (12, 12), about half a pixel at navigation sizes.

   Glyphs have uniform strokes and fill="none", so arc length measures ink
   weight. A filled glyph would also need an area term. Check that centring
   leaves room for the entire 2-unit stroke inside the view box. */

import { describe, expect, it } from 'vitest';
import { PATHS } from '../src/lib/components/icons';
import { measure } from './icon-ink';

/** The rule, as one number. See this file's header for why it is this
    measure and this tolerance. */
const TOLERANCE = 0.5;

/** Half a 2-unit stroke, which is how much room the ink needs inside the 24
    box before a mark starts losing its edge to the viewBox. */
const SAFE = 1;

const names = Object.keys(PATHS);

describe('optical centring', () => {
  it.each(names)('%s sits within the tolerance of the box centre', (name) => {
    const { off, optical, box, mass } = measure(PATHS[name]);
    expect(
      off,
      `${name}: optical centre (${optical.x.toFixed(2)}, ${optical.y.toFixed(2)}) is ${off.toFixed(
        2
      )} from (12, 12) - box (${box.x.toFixed(2)}, ${box.y.toFixed(2)}), mass (${mass.x.toFixed(
        2
      )}, ${mass.y.toFixed(2)})`
    ).toBeLessThanOrEqual(TOLERANCE);
  });

  it.each(names)('%s keeps its stroke inside the box', (name) => {
    const { bounds } = measure(PATHS[name]);
    expect(bounds.minX, `${name} runs off the left`).toBeGreaterThanOrEqual(SAFE);
    expect(bounds.minY, `${name} runs off the top`).toBeGreaterThanOrEqual(SAFE);
    expect(bounds.maxX, `${name} runs off the right`).toBeLessThanOrEqual(24 - SAFE);
    expect(bounds.maxY, `${name} runs off the bottom`).toBeLessThanOrEqual(24 - SAFE);
  });
});

/* Settings' first card draws `mood`, `globe` and `access` side by side, and
   the first two are both a 9-unit ring with something inside. A third ring
   made the row three coins in a stack (prh12), so the accessibility figure
   stands on its own. */
describe('access is not another ring', () => {
  it('draws no circle bigger than a head', () => {
    const radii = [...PATHS.access.matchAll(/<circle[^>]*\sr="([\d.]+)"/g)].map((m) => Number(m[1]));
    for (const r of radii) expect(r).toBeLessThan(4);
  });
});
