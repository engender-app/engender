import { describe, expect, it } from 'vitest';
import { GAZE_REACH, MAGNIFIER_SPREAD, gazeRow, gazeToCell, magnify } from './magnifier';

describe('magnify', () => {
  /* The literal rather than the module's own constant, which would have made
     this tautological - it asserted that the peak equals the peak. 1.24 is
     the number the row was designed around: .fan-card clips, so a face that
     grew much further would lose its own top. */
  it('is at its peak for the face under the finger', () => {
    expect(magnify(100, 100, 120)).toBeCloseTo(1.24, 5);
  });

  it('leaves a face the finger is nowhere near alone', () => {
    expect(magnify(100, 400, 120)).toBe(1);
    expect(magnify(100, 220, 120)).toBe(1);
  });

  it('falls off with distance', () => {
    const near = magnify(100, 130, 120);
    const far = magnify(100, 190, 120);
    expect(near).toBeGreaterThan(far);
    expect(far).toBeGreaterThan(1);
  });

  it('is the same either side of the finger', () => {
    expect(magnify(100, 140, 120)).toBeCloseTo(magnify(100, 60, 120), 10);
  });

  /* Flat at the peak, which is the point of a squared falloff rather than a
     linear one: a finger resting on a target jitters by a pixel or two, and
     a linear falloff makes the face under it flutter in step with the noise. */
  it('barely moves for a jitter under the finger', () => {
    const still = magnify(100, 100, 120);
    const jittered = magnify(102, 100, 120);
    expect(still - jittered).toBeLessThan(0.002);
  });

  it('never returns less than resting size', () => {
    for (const centre of [-500, 0, 50, 100, 150, 1000]) {
      expect(magnify(100, centre, 120)).toBeGreaterThanOrEqual(1);
    }
  });

  it('reaches exactly resting size at the edge of its spread', () => {
    expect(magnify(100, 220, 120)).toBe(1);
  });

  it('does nothing with no spread to work across', () => {
    expect(magnify(100, 100, 0)).toBe(1);
  });

  it('spreads across more than one cell, so neighbours lift too', () => {
    expect(MAGNIFIER_SPREAD).toBeGreaterThan(1);
    expect(MAGNIFIER_SPREAD).toBeLessThan(2.5);
  });
});

/* The gaze is the magnifier's second channel (phase 9 carpet ticket 01). The
   magnifier answers the finger with size, which only the face under it can
   show; the gaze answers with direction, which every face in the row can show
   at once. That is the whole reason it exists: a row of five that all turn
   toward the finger says the row is being crossed, from four faces that the
   scale leaves at rest. */
const ROW = { left: 100, width: 500 } as DOMRect;

describe('gazeRow', () => {
  it('turns every face toward the finger, whichever side it is on', () => {
    /* Cell centres at 150, 250, 350, 450, 550. */
    const gaze = gazeRow(550, ROW, 5);
    expect(gaze.slice(0, 4).every((g) => g > 0)).toBe(true);
  });

  it('leaves the face directly under the finger looking straight ahead', () => {
    expect(gazeRow(350, ROW, 5)[2]).toBeCloseTo(0, 10);
  });

  it('turns further the further the finger is, up to the point it runs out', () => {
    /* The finger between the first two cells: each turns half way, toward it
       and so away from each other. */
    const gaze = gazeRow(200, ROW, 5);
    expect(gaze[0]).toBeCloseTo(0.5, 10);
    expect(gaze[1]).toBeCloseTo(-0.5, 10);
  });

  /* Eyes are eyes, not compass needles: they run out of travel. Everything
     past the next cell along looks equally hard, which is also what keeps the
     drawing inside its disc (mood-faces.test.ts holds that end of it). */
  it('never turns further than the eyes can travel', () => {
    for (const x of [-4000, 0, 350, 4000]) {
      for (const g of gazeRow(x, ROW, 5)) expect(Math.abs(g)).toBeLessThanOrEqual(1);
    }
  });

  it('is fully turned by one cell away and stays there', () => {
    const next = gazeRow(250, ROW, 5);
    expect(next[2]).toBeCloseTo(-1, 10);
    expect(next[4]).toBeCloseTo(-1, 10);
  });

  it('has no gaze to give with no row to measure', () => {
    expect(gazeRow(350, { left: 0, width: 0 } as DOMRect, 5)).toEqual([0, 0, 0, 0, 0]);
  });
});

describe('gazeToCell', () => {
  /* The pick's own beat: the four faces that were not chosen turn to look at
     the one that was. Same channel as the finger's, pointed at a cell index
     rather than at a coordinate, so no surface has to know where its own row
     landed on the screen to run it. */
  it('turns the others toward the picked face', () => {
    const gaze = gazeToCell(0, 5);
    expect(gaze[1]).toBeCloseTo(-1, 10);
    expect(gaze[4]).toBeCloseTo(-1, 10);
  });

  it('leaves the picked face looking straight out', () => {
    expect(gazeToCell(3, 5)[3]).toBe(0);
  });

  it('looks the other way for a pick on the other side', () => {
    expect(gazeToCell(4, 5)[0]).toBeCloseTo(1, 10);
  });

  it('lets go when nothing is picked', () => {
    expect(gazeToCell(null, 5)).toEqual([0, 0, 0, 0, 0]);
  });
});

describe('GAZE_REACH', () => {
  /* In user units of MoodFace's 24-box. Small on purpose: an eye that travels
     far enough to notice on its own is a googly eye, and five of those is a
     different app. mood-faces.test.ts is what holds it inside the disc. */
  it('is a fraction of an eye rather than a journey across the face', () => {
    expect(GAZE_REACH).toBeGreaterThan(0.4);
    expect(GAZE_REACH).toBeLessThan(1.6);
  });
});
