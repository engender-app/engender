import { describe, expect, it } from 'vitest';

import { ARC_GAP, MAX_SLICES, MIN_ARC, arcs, slices } from './parts';

const part = (key: string, amount: number) => ({ key, name: key, amount });

describe('the slices a donut draws', () => {
  it('reads a share off the whole rather than off the largest part', () => {
    const out = slices([part('a', 3), part('b', 1)], 'Other');
    expect(out.map((s) => s.share)).toEqual([75, 25]);
  });

  it('draws the largest part first, whatever order the caller counted in', () => {
    const out = slices([part('small', 1), part('big', 8), part('mid', 3)], 'Other');
    expect(out.map((s) => s.key)).toEqual(['big', 'mid', 'small']);
  });

  it('keeps the caller order between two parts of the same size', () => {
    const out = slices([part('first', 2), part('second', 2)], 'Other');
    expect(out.map((s) => s.key)).toEqual(['first', 'second']);
  });

  it('gathers everything past the cap into one remainder', () => {
    const many = Array.from({ length: 9 }, (_, i) => part(`p${i}`, 9 - i));
    const out = slices(many, 'Other');
    expect(out).toHaveLength(MAX_SLICES);
    const rest = out[out.length - 1];
    expect(rest.isRest).toBe(true);
    expect(rest.name).toBe('Other');
    // 5 + 4 + 3 + 2 + 1, the five parts the cap dropped.
    expect(rest.amount).toBe(15);
  });

  it('leaves a set that fits the cap exactly alone, with no remainder', () => {
    const five = Array.from({ length: MAX_SLICES }, (_, i) => part(`p${i}`, i + 1));
    const out = slices(five, 'Other');
    expect(out).toHaveLength(MAX_SLICES);
    expect(out.some((s) => s.isRest)).toBe(false);
  });

  /* The remainder is what keeps the ring a whole: a capped set still has to
     add up to everything logged, or the largest slice reads as a bigger
     share of the person's own data than it is. */
  it('adds up to the whole once the cap has dropped something', () => {
    const many = Array.from({ length: 12 }, (_, i) => part(`p${i}`, 12 - i));
    const total = slices(many, 'Other').reduce((sum, s) => sum + s.share, 0);
    expect(total).toBeCloseTo(100, 6);
  });

  it('drops a part nothing was logged against rather than naming a zero', () => {
    const out = slices([part('a', 4), part('none', 0), part('b', 2)], 'Other');
    expect(out.map((s) => s.key)).toEqual(['a', 'b']);
  });

  it('draws nothing at all for a whole that is empty', () => {
    expect(slices([], 'Other')).toEqual([]);
    expect(slices([part('a', 0)], 'Other')).toEqual([]);
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

  it('gives an arc the floor where its share has room for the gap', () => {
    // 2% of 200 is 4: a gap would leave 2, so the floor takes it to 3 and
    // the break after it shrinks instead.
    expect(arcs([98, 2], C)[1].dash).toBe(MIN_ARC);
  });

  /* The floor is what keeps a small share visible, and drawing past the
     next arc's start is how it stops being: the next arc paints over this
     one, so an overdrawn sliver renders shorter than the floor was for. */
  it('never draws an arc past where the next one starts', () => {
    const shares = [95, 0.5, 2, 2.5];
    const out = arcs(shares, C);
    out.forEach((arc, i) => {
      const own = (shares[i] / 100) * C;
      expect(arc.dash, `arc ${i}`).toBeLessThanOrEqual(own);
      if (i > 0) expect(-arc.offset).toBeGreaterThanOrEqual(-out[i - 1].offset + out[i - 1].dash);
    });
  });

  it('keeps a share too small for the gap at its own full length', () => {
    // 0.5% of 200 is 1, under the gap and under the floor: it draws all of
    // itself and gives up no break.
    expect(arcs([99.5, 0.5], C)[1].dash).toBe(1);
  });

  it('draws no arc for a share of nothing', () => {
    expect(arcs([100, 0], C)[1].dash).toBe(0);
  });
});
