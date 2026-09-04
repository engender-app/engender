import { describe, expect, it } from 'vitest';

import { ARC_GAP, MAX_SLICES, MIN_ARC, arcs, sliced } from './parts';

const part = (key: string, amount: number) => ({ key, name: key, amount });

describe('the slices a donut draws', () => {
  it('reads a share off the whole rather than off the largest part', () => {
    const out = sliced([part('a', 3), part('b', 1)], 'Other');
    expect(out.map((s) => s.share)).toEqual([75, 25]);
  });

  it('draws the largest part first, whatever order the caller counted in', () => {
    const out = sliced([part('small', 1), part('big', 8), part('mid', 3)], 'Other');
    expect(out.map((s) => s.key)).toEqual(['big', 'mid', 'small']);
  });

  it('keeps the caller order between two parts of the same size', () => {
    const out = sliced([part('first', 2), part('second', 2)], 'Other');
    expect(out.map((s) => s.key)).toEqual(['first', 'second']);
  });

  it('gathers everything past the cap into one remainder', () => {
    const many = Array.from({ length: 9 }, (_, i) => part(`p${i}`, 9 - i));
    const out = sliced(many, 'Other');
    expect(out).toHaveLength(MAX_SLICES);
    const rest = out[out.length - 1];
    expect(rest.isRest).toBe(true);
    expect(rest.name).toBe('Other');
    // 5 + 4 + 3 + 2 + 1, the five parts the cap dropped.
    expect(rest.amount).toBe(15);
  });

  it('leaves a set that fits the cap exactly alone, with no remainder', () => {
    const five = Array.from({ length: MAX_SLICES }, (_, i) => part(`p${i}`, i + 1));
    const out = sliced(five, 'Other');
    expect(out).toHaveLength(MAX_SLICES);
    expect(out.some((s) => s.isRest)).toBe(false);
  });

  /* The remainder is what keeps the ring a whole: a capped set still has to
     add up to everything logged, or the largest slice reads as a bigger
     share of the person's own data than it is. */
  it('adds up to the whole once the cap has dropped something', () => {
    const many = Array.from({ length: 12 }, (_, i) => part(`p${i}`, 12 - i));
    const total = sliced(many, 'Other').reduce((sum, s) => sum + s.share, 0);
    expect(total).toBeCloseTo(100, 6);
  });

  it('drops a part nothing was logged against rather than naming a zero', () => {
    const out = sliced([part('a', 4), part('none', 0), part('b', 2)], 'Other');
    expect(out.map((s) => s.key)).toEqual(['a', 'b']);
  });

  it('draws nothing at all for a whole that is empty', () => {
    expect(sliced([], 'Other')).toEqual([]);
    expect(sliced([part('a', 0)], 'Other')).toEqual([]);
  });
});

describe('the arcs a ring is drawn from', () => {
  const C = 200;

  it('places each arc where the ones before it ended', () => {
    const out = arcs([50, 25, 25], C);
    expect(out.map((a) => a.offset)).toEqual([0, -100, -150]);
  });

  it('leaves the rest of the circumference undrawn, so one arc means one dash', () => {
    const out = arcs([100], C);
    expect(out[0].dash + out[0].rest).toBe(C);
  });

  it('breaks between two arcs so a ring reads as parts rather than as a band', () => {
    const [first] = arcs([50, 50], C);
    expect(first.dash).toBe(100 - ARC_GAP);
  });

  /* A single part is the whole ring, and a gap in it would be a break with
     nothing on the other side of it. */
  it('closes the ring where there is only one part', () => {
    expect(arcs([100], C)[0].dash).toBe(C);
  });

  it('keeps a share too small to take the gap out of visible anyway', () => {
    const out = arcs([99, 1], C);
    // 1% of 200 is 2, which is the gap itself.
    expect(out[1].dash).toBe(MIN_ARC);
  });

  it('draws no arc for a share of nothing', () => {
    expect(arcs([100, 0], C)[1].dash).toBe(0);
  });
});
