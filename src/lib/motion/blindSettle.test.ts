import { describe, expect, it } from 'vitest';

import { blindSettle, EASE_OUT_VAR } from './blindSettle';

/** The stops of a `linear()`, in order. */
function stops(easing: string): number[] {
  const inside = easing.match(/^linear\((.+)\)$/);
  if (!inside) throw new Error(`not a linear(): ${easing}`);
  return inside[1].split(',').map((s) => Number(s.trim()));
}

describe('the blind settling on its mark', () => {
  it('runs 6% of the travel past the mark on the way down', () => {
    const settle = blindSettle({ from: 102, to: 202 });
    expect(settle.travel).toBe(100);
    expect(settle.overshoot).toBeCloseTo(6, 5);
  });

  it('caps the overshoot at 8px however far the edge travels', () => {
    expect(blindSettle({ from: 0, to: 300 }).overshoot).toBe(8);
  });

  it('suppresses the overshoot below 24px of travel', () => {
    const settle = blindSettle({ from: 175, to: 160 });
    expect(settle.travel).toBe(15);
    expect(settle.overshoot).toBe(0);
    expect(settle.easing).toBe(EASE_OUT_VAR);
  });

  /* A partial close raises the edge past its mark, and the content under it
     is already on its own mark: the band between the two is page, which the
     ticket's "no gap is ever revealed" forbids. Closing to nothing has no
     such band - the overshoot is above the window's top edge. */
  it('does not overshoot a close that stops on a shorter field', () => {
    expect(blindSettle({ from: 215, to: 120 }).overshoot).toBe(0);
    expect(blindSettle({ from: 215, to: 120 }).easing).toBe(EASE_OUT_VAR);
  });

  it('overshoots a close to nothing, which the window swallows', () => {
    const settle = blindSettle({ from: 215, to: 0 });
    expect(settle.travel).toBe(215);
    expect(settle.overshoot).toBe(8);
  });

  it('stands still where there is nothing to travel', () => {
    const settle = blindSettle({ from: 175, to: 175 });
    expect(settle.travel).toBe(0);
    expect(settle.overshoot).toBe(0);
    expect(settle.easing).toBe(EASE_OUT_VAR);
  });
});

describe('the curve the settle is sampled from', () => {
  const settle = blindSettle({ from: 100, to: 200 });

  it('starts at its mark and ends on it', () => {
    const curve = stops(settle.easing);
    expect(curve[0]).toBe(0);
    expect(curve.at(-1)).toBe(1);
  });

  it('peaks at the overshoot it was asked for, as a fraction of the travel', () => {
    const peak = Math.max(...stops(settle.easing));
    expect(peak).toBeCloseTo(1 + settle.overshoot / settle.travel, 2);
  });

  it('rises to the peak without wavering on the way', () => {
    const curve = stops(settle.easing);
    const peak = curve.indexOf(Math.max(...curve));
    for (let i = 1; i <= peak; i++) expect(curve[i], `stop ${i}`).toBeGreaterThan(curve[i - 1]);
  });

  it('comes back from the peak and stays there', () => {
    const curve = stops(settle.easing);
    const peak = curve.indexOf(Math.max(...curve));
    /* One crossing back and no second bounce: every stop after the peak is
       within the overshoot of the mark, and the tail is settled rather than
       still swinging. */
    const overshootFraction = settle.overshoot / settle.travel;
    for (const value of curve.slice(peak)) {
      expect(Math.abs(value - 1)).toBeLessThanOrEqual(overshootFraction + 0.001);
    }
    expect(Math.abs(curve.at(-2)! - 1)).toBeLessThan(0.01);
  });

  it('samples densely enough for the browser to read one curve rather than a staircase', () => {
    expect(stops(settle.easing).length).toBeGreaterThanOrEqual(16);
  });
});
