/* PhotoWipe.svelte is the surface; everything it decides is here (phase 10
   redesign ticket 55). The component itself holds one number and draws it,
   which is what is left once the pointer arithmetic, the keyboard map and
   the crop rule are lifted out. */

import { describe, expect, it } from 'vitest';

import { WIPE_KEY_STEP, cropDiffers, fractionAt, fractionForKey } from './photoWipe';

/** A 358px frame inset 16px from the left of the screen - the real geometry
    at 390px, which is the width every rule in this app is measured at. */
const frame = { left: 16, width: 358 };

describe('fractionAt - the drag', () => {
  it('reads the frame’s own edges as 0 and 1', () => {
    expect(fractionAt(16, frame)).toBe(0);
    expect(fractionAt(374, frame)).toBe(1);
  });

  it('reads the middle as half', () => {
    expect(fractionAt(195, frame)).toBeCloseTo(0.5, 5);
  });

  it('pins a drag that left the frame to the side it left by', () => {
    // A finger that keeps going past the edge holds the divider there
    // rather than running the value off the end, and the gesture stays
    // live so coming back picks it up again.
    expect(fractionAt(-200, frame)).toBe(0);
    expect(fractionAt(900, frame)).toBe(1);
  });

  it('is 0 for a frame with no width, rather than a division by zero', () => {
    // A frame measured before layout - the first pointerdown of a gesture
    // that began in the same frame the component mounted in.
    expect(fractionAt(100, { left: 0, width: 0 })).toBe(0);
  });
});

describe('fractionForKey - the keyboard path', () => {
  it('walks left and right by one step', () => {
    expect(fractionForKey('ArrowRight', 0.5)).toBeCloseTo(0.5 + WIPE_KEY_STEP, 5);
    expect(fractionForKey('ArrowLeft', 0.5)).toBeCloseTo(0.5 - WIPE_KEY_STEP, 5);
  });

  it('takes up and down as well, which is what a slider does', () => {
    expect(fractionForKey('ArrowUp', 0.5)).toBeCloseTo(0.55, 5);
    expect(fractionForKey('ArrowDown', 0.5)).toBeCloseTo(0.45, 5);
  });

  it('stops at either end rather than wrapping', () => {
    expect(fractionForKey('ArrowLeft', 0)).toBe(0);
    expect(fractionForKey('ArrowRight', 1)).toBe(1);
  });

  it('jumps to a whole photograph on Home and End', () => {
    expect(fractionForKey('Home', 0.42)).toBe(0);
    expect(fractionForKey('End', 0.42)).toBe(1);
  });

  it('returns null for a key this control does not take', () => {
    // Which is how the component knows to leave Tab, Enter and the rest to
    // the page instead of swallowing them.
    expect(fractionForKey('Tab', 0.5)).toBeNull();
    expect(fractionForKey('Enter', 0.5)).toBeNull();
  });
});

describe('cropDiffers - what the frame says about two shapes', () => {
  it('says nothing about two photographs off the same camera', () => {
    expect(cropDiffers({ width: 1536, height: 2048 }, { width: 1536, height: 2048 })).toBe(false);
  });

  it('says nothing about a rounding of the same shape', () => {
    // A JPEG encoder that landed on an even number of pixels is not a
    // different shape, and a note that appeared for one would appear for
    // most pairs.
    expect(cropDiffers({ width: 1536, height: 2048 }, { width: 1535, height: 2047 })).toBe(false);
  });

  it('says so when one was shot or scanned to another shape', () => {
    // A square scan of a print beside a portrait phone photo: the frame
    // crops far more off one than the other, and that is the case the note
    // exists for.
    expect(cropDiffers({ width: 1536, height: 2048 }, { width: 2048, height: 2048 })).toBe(true);
  });

  it('says nothing while a photograph is still loading', () => {
    // Nothing has been decoded, so there is no shape to disagree with yet -
    // and a note that flickered on as bytes arrived would be worse than
    // one that waits.
    expect(cropDiffers(null, { width: 1536, height: 2048 })).toBe(false);
    expect(cropDiffers({ width: 1536, height: 2048 }, null)).toBe(false);
  });

  it('says nothing about a shape with no pixels in it', () => {
    expect(cropDiffers({ width: 0, height: 0 }, { width: 1536, height: 2048 })).toBe(false);
  });
});
