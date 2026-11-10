import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { STEP_MOTION, stepMotion, stepTravel } from './entryStep';

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
  it('ships the shared axis until Alicja picks', () => {
    expect(STEP_MOTION).toBe('axis');
  });

  it('on the axis, the leaving step goes the way the person is going and the arriving one comes from the far side', () => {
    const out = stepTravel(node, { motion: 'axis' }, { direction: 'out' });
    const into = stepTravel(node, { motion: 'axis' }, { direction: 'in' });
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
    const into = stepTravel(node, { motion: 'axis', back: true }, { direction: 'in' });
    expect(x(into.css!(0, 1))).toBeLessThan(0);
  });

  it('turns a solid page over the step it replaces, from the window edge, and back off it', () => {
    const forwardIn = stepTravel(node, { motion: 'turn' }, { direction: 'in' }).css!;
    expect(x(forwardIn(0, 1))).toBe(300);
    expect(x(forwardIn(1, 0))).toBe(0);
    // The travelling page never fades: it is an object arriving, not appearing.
    for (const t of [0, 0.3, 0.7, 1]) expect(opacity(forwardIn(t, 1 - t))).toBe(1);
    expect(forwardIn(0.5, 0.5)).toContain('z-index: 2');

    const forwardOut = stepTravel(node, { motion: 'turn' }, { direction: 'out' }).css!;
    expect(x(forwardOut(0, 1))).toBe(-100);
    expect(forwardOut(0.5, 0.5)).toContain('z-index: 1');

    const backOut = stepTravel(node, { motion: 'turn', back: true }, { direction: 'out' }).css!;
    expect(x(backOut(0, 1))).toBe(300);
    expect(opacity(backOut(0.2, 0.8))).toBe(1);
  });

  it('crossfades instead under reduced motion, whichever was picked', () => {
    dataset.a11yMotion = 'reduce';
    for (const motion of ['axis', 'field', 'turn'] as const) {
      const css = stepTravel(node, { motion }, { direction: 'in' }).css!(0.5, 0.5);
      expect(css).not.toContain('translate');
    }
  });

  it('reads the candidate from the address only in a demo build', () => {
    expect(stepMotion('?stepMotion=turn')).toBe(STEP_MOTION);
    vi.stubGlobal('__DEMO__', true);
    expect(stepMotion('?stepMotion=turn')).toBe('turn');
    expect(stepMotion('?stepMotion=nonsense')).toBe(STEP_MOTION);
  });
});
