import { describe, expect, it } from 'vitest';
import { MAGNIFIER_SPREAD, magnify } from './magnifier';

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
