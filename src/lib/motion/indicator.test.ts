import { describe, expect, it } from 'vitest';
import { boxesMatch, squash, stretch, type Box } from './indicator';

const box = (x: number, y: number, w: number, h: number): Box => ({ x, y, w, h });

describe('boxesMatch', () => {
  it('is true for the same rectangle', () => {
    expect(boxesMatch(box(0, 0, 60, 48), box(0, 0, 60, 48))).toBe(true);
  });

  it('is false once anything about it moves', () => {
    expect(boxesMatch(box(0, 0, 60, 48), box(60, 0, 60, 48))).toBe(false);
    expect(boxesMatch(box(0, 0, 60, 48), box(0, 0, 61, 48))).toBe(false);
  });

  /* Sub-pixel layout noise is not a slide. A container that reflows by a
     third of a pixel would otherwise replay the stretch on every resize
     tick, which is the one way this animation could become a loop. */
  it('ignores a difference under half a pixel', () => {
    expect(boxesMatch(box(0, 0, 60, 48), box(0.3, 0, 60, 48))).toBe(true);
  });
});

describe('stretch', () => {
  it('does not deform a pill that has not moved', () => {
    expect(stretch(box(0, 0, 60, 48), box(0, 0, 60, 48), 'x')).toBe(1);
  });

  /* The point of making this a function of distance rather than a constant:
     a hop to the next tab and a jump across the whole bar should not deform
     by the same amount, or the deformation is a decoration rather than a
     consequence of the travel. */
  it('deforms further the further it travels', () => {
    const near = stretch(box(0, 0, 60, 48), box(60, 0, 60, 48), 'x');
    const far = stretch(box(0, 0, 60, 48), box(240, 0, 60, 48), 'x');
    expect(near).toBeGreaterThan(1);
    expect(far).toBeGreaterThan(near);
  });

  it('caps how far it will deform', () => {
    expect(stretch(box(0, 0, 60, 48), box(4000, 0, 60, 48), 'x')).toBeLessThanOrEqual(1.18);
  });

  /* The rail runs down the screen, so its travel and its stretch are both
     on Y, measured against the pill's height rather than its width. */
  it('measures a vertical move against the pill height', () => {
    expect(stretch(box(0, 0, 200, 48), box(0, 48, 200, 48), 'y')).toBeCloseTo(
      stretch(box(0, 0, 48, 200), box(48, 0, 48, 200), 'x'),
      5
    );
  });

  it('ignores movement across the axis it is not travelling on', () => {
    expect(stretch(box(0, 0, 60, 48), box(0, 300, 60, 48), 'x')).toBe(1);
  });
});

describe('squash', () => {
  it('leaves an undeformed pill alone', () => {
    expect(squash(1)).toBe(1);
  });

  /* Thinner as it lengthens, but not by the reciprocal: a pill that keeps
     its area exactly reads as rubber, and this one is meant to read as
     something with weight being carried. */
  it('thins by less than the stretch lengthens', () => {
    const thin = squash(1.1);
    expect(thin).toBeLessThan(1);
    expect(thin).toBeGreaterThan(1 / 1.1);
  });
});
