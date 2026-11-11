import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { footContinue, stepTravel } from './entryStep';

/* A stand-in for the element the transition runs on: 300px wide, nothing
   animating on it, nothing computed. */
const node = {
  getBoundingClientRect: () => ({ width: 300 }),
  getAnimations: () => []
} as unknown as Element;

function frames(css: (t: number, u: number) => string, ts: number[]) {
  return ts.map((t) => css(t, 1 - t));
}

const x = (css: string) => Number(/translateX\((-?[\d.]+)px\)/.exec(css)?.[1] ?? NaN);
const opacity = (css: string) => Number(/opacity: ([\d.]+)/.exec(css)?.[1] ?? NaN);

/* The Node tier has no document; the motion setting is all these read of one. */
const dataset: Record<string, string | undefined> = {};
beforeEach(() => {
  vi.stubGlobal('document', { documentElement: { dataset } });
});
afterEach(() => {
  vi.unstubAllGlobals();
  dataset.a11yMotion = undefined;
});

describe('a new entry stepping forward and back', () => {
  it('on the axis, the leaving step goes the way the person is going and the arriving one comes from the far side', () => {
    const out = stepTravel(node, {}, { direction: 'out' });
    const into = stepTravel(node, {}, { direction: 'in' });
    // Svelte runs an outro's t from 1 to 0 and an intro's from 0 to 1.
    const [outStart, outEnd] = frames(out.css!, [1, 0]);
    const [inStart, inEnd] = frames(into.css!, [0, 1]);
    expect(x(outStart)).toBe(0);
    expect(x(outEnd)).toBeLessThan(0);
    expect(x(inStart)).toBeGreaterThan(0);
    expect(x(inEnd)).toBe(0);
    expect(opacity(inStart)).toBe(0);
    expect(opacity(outStart)).toBe(1);
  });

  it('runs the axis the other way for a step back', () => {
    const into = stepTravel(node, { back: true }, { direction: 'in' });
    expect(x(into.css!(0, 1))).toBeLessThan(0);
  });

  it('crossfades instead under reduced motion', () => {
    dataset.a11yMotion = 'reduce';
    const css = stepTravel(node, {}, { direction: 'in' }).css!(0.5, 0.5);
    expect(css).not.toContain('translate');
  });
});

/* The way on under the finish control (ticket 04): it opens and closes along
   the foot's own direction, so the finish control is carried continuously. */
describe('the foot\'s way on', () => {
  const foot = (flexDirection: string, size: { width: number; height: number }) => {
    vi.stubGlobal('getComputedStyle', () => ({ flexDirection, columnGap: '8px', getPropertyValue: () => '' }));
    return {
      getBoundingClientRect: () => size,
      parentElement: {}
    } as unknown as Element;
  };

  it('opens its height in a column, from nothing to its full size, fading with it', () => {
    const css = footContinue(foot('column', { width: 320, height: 56 })).css!;
    expect(css(0, 1)).toContain('height: 0px');
    expect(css(1, 0)).toContain('height: 56px');
    expect(css(0.5, 0.5)).toContain('height: 28px');
    expect(css(0.5, 0.5)).toContain('opacity: 0.5');
  });

  it('opens its width in a row, taking its gap with it', () => {
    const css = footContinue(foot('row', { width: 200, height: 48 })).css!;
    expect(css(0, 1)).toContain('width: 0px');
    expect(css(0, 1)).toContain('margin-inline-start: -8px');
    expect(css(1, 0)).toContain('width: 200px');
    expect(css(1, 0)).toContain('margin-inline-start: 0px');
  });

  it('crossfades instead under reduced motion', () => {
    dataset.a11yMotion = 'reduce';
    expect(footContinue(foot('column', { width: 1, height: 1 })).css!(0.5, 0.5)).not.toContain('height');
  });
});
