/* Optical centring, as a rule the whole icon set is held to (phase 5 ticket 31).

   Ticket 21 found the `flag` mark sitting up and to the left in every disc
   that drew it, and fixed it by centring its bounding box. That is the right
   instinct and the wrong measure. A bounding box knows how far the ink
   reaches and nothing about where its weight is, so it centres a mark with a
   long thin tail as though the tail were as heavy as the head - which is how
   a flag whose pole is one stroke and whose banner is a filled-looking wedge
   ends up reading off-centre while measuring perfectly centred.

   The measure this repo uses instead:

     A mark's optical centre is the midpoint between the centre of its ink
     bounding box and its arc-length-weighted ink centroid. It must lie
     within 0.75 user units of (12, 12) in the 24-unit box.

   Both halves are load-bearing and each one alone is wrong. The centroid
   alone over-corrects: an arrow is a heavy head on a light shaft, and
   dragging its centroid to the middle pushes the shaft off the box. The
   bounding box alone under-corrects, which is the flag. Halfway between them
   is what a designer's eye actually does - it reads extent and weight at the
   same time and splits the difference - and it is a number, so a test can
   hold it.

   Every glyph is stroked and none is filled (`icon()` sets fill="none"), so
   ink mass really is arc length: a uniform 2-unit stroke lays down the same
   weight per unit travelled wherever it goes. That is what makes the
   centroid computable at all, and it is why a filled glyph added later would
   need this file to grow an area term rather than being waved through.

   0.75 units is 0.75px at the 24px the nav bar draws and 0.69px at the 22px
   the rail does. Half a pixel is about where a mark starts to look like it
   is leaning in its disc, so the tolerance sits just above the point of
   visibility rather than at the point of measurability.

   The safe-area check below is the other half of the sweep: a mark may be
   moved to satisfy the rule, and moving it must not push a 2-unit stroke off
   the edge of the box it is centred in. */

import { describe, expect, it } from 'vitest';
import { PATHS } from '../src/lib/components/icons';
import { measure } from './icon-ink';

/** The rule, as one number. See this file's header for why it is this
    measure and this tolerance. */
const TOLERANCE = 0.75;

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
