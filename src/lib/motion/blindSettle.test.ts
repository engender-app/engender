import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  bezier,
  blindSettle,
  EASE_OUT_POINTS,
  EASE_OUT_SOFT_POINTS,
  EASE_OUT_SOFT_VAR,
  EASE_OUT_VAR
} from './blindSettle';

const easeOut = bezier(EASE_OUT_POINTS);
const easeOutSoft = bezier(EASE_OUT_SOFT_POINTS);

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
    const settle = blindSettle({ from: 160, to: 175 });
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
  });

  /* An edge travelling the height of a field leaves at four times its
     average speed on --ease-out, which reads as a jump; --ease-out-soft is
     the same deceleration with the instant off the front. Only on the way
     up, where a blind that lags the content covers more of it rather than
     less. */
  it('leaves more gently on the way up than on the way down', () => {
    expect(blindSettle({ from: 215, to: 120 }).easing).toBe(EASE_OUT_SOFT_VAR);
    expect(blindSettle({ from: 200, to: 215 }).easing).toBe(EASE_OUT_VAR);
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
    /* One stop from the end it is inside a quarter of the overshoot, which
       on a 77px pull is under a pixel: the swell has died rather than the
       curve being cut off at the mark. */
    expect(Math.abs(curve.at(-2)! - 1)).toBeLessThan(overshootFraction / 4);
  });

  it('samples densely enough for the browser to read one curve rather than a staircase', () => {
    expect(stops(settle.easing).length).toBeGreaterThanOrEqual(16);
  });

  /* The load-bearing one. The blind is painted over the page and covers the
     difference between its own curve and the content's, which it can only
     do while it is the further along of the two: a curve that started
     slowly - a spring's step response, which this was until the flipbooks
     were measured - let the content's top run 14px ahead of the edge and
     showed that band of page for 120ms. */
  it('never falls behind the plain ease-out the content under it travels on', () => {
    const curve = stops(settle.easing);
    for (const [i, value] of curve.entries()) {
      const t = i / (curve.length - 1);
      expect(value, `at ${Math.round(t * 100)}%`).toBeGreaterThanOrEqual(easeOut(t) - 0.001);
    }
  });

  /* The curve it is held above is the app's own token, so a change to one
     that left the other behind would be a silent regression. */
  it('is built on the same two curves the stylesheet publishes', () => {
    const token = readFileSync(new URL('../theme/base.css', import.meta.url), 'utf8');
    expect(token).toContain(`--ease-out: cubic-bezier(${EASE_OUT_POINTS.join(', ')})`);
    expect(token).toContain(`--ease-out-soft: cubic-bezier(${EASE_OUT_SOFT_POINTS.join(', ')})`);
    for (const curve of [easeOut, easeOutSoft]) {
      expect(curve(0)).toBeCloseTo(0, 5);
      expect(curve(1)).toBeCloseTo(1, 5);
    }
  });

  /* The close that lands at nothing is the one close that overshoots, and
     it is built on the softer curve, so it lags the content the whole way
     up: what it uncovers is above the window's top edge. */
  it('keeps a close behind the content it is covering, overshoot and all', () => {
    const closing = blindSettle({ from: 215, to: 0 });
    const curve = stops(closing.easing);
    for (const [i, value] of curve.entries()) {
      const t = i / (curve.length - 1);
      expect(value, `at ${Math.round(t * 100)}%`).toBeLessThanOrEqual(easeOut(t) + 0.06);
    }
  });
});
