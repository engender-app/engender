import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { GATE_FLAG, GATE_FLAGS, gateDrawsFlag, gateFlagChoice, gateStripes, gateSun } from './gateFlag';

const css = readFileSync('src/lib/theme/palettes.css', 'utf8');
const STRIPES = new Map(
  [...css.matchAll(/\[data-palette="([^"]+)"\]\s*\{\s*--motif-stripes:\s*([^;]+);/g)].map((m) => [
    m[1],
    m[2].split(',').map((s) => s.trim())
  ])
);

afterEach(() => vi.unstubAllGlobals());

describe('which gates draw the flag', () => {
  it('draws it on an unlock only, and never under disguise', () => {
    expect(gateDrawsFlag({ unlock: true, disguise: false })).toBe(true);
    expect(gateDrawsFlag({ unlock: true, disguise: true })).toBe(false);
    expect(gateDrawsFlag({ unlock: false, disguise: false })).toBe(false);
    expect(gateDrawsFlag({ unlock: false, disguise: true })).toBe(false);
  });
});

describe('the demo switch', () => {
  it('ships the default in a production build, whatever the address asks', () => {
    vi.stubGlobal('__DEMO__', false);
    for (const asked of GATE_FLAGS) expect(gateFlagChoice(`?gateFlag=${asked}`)).toBe(GATE_FLAG);
  });

  it('lets a demo build open each option, and ignores anything else', () => {
    vi.stubGlobal('__DEMO__', true);
    for (const asked of GATE_FLAGS) expect(gateFlagChoice(`?gateFlag=${asked}`)).toBe(asked);
    expect(gateFlagChoice('?gateFlag=wordmark')).toBe(GATE_FLAG);
    expect(gateFlagChoice('')).toBe(GATE_FLAG);
  });
});

describe("the flag's paint", () => {
  it('draws every palette as its own stripes, in order, at equal heights, unaltered', () => {
    expect(STRIPES.size).toBeGreaterThanOrEqual(16);
    for (const [palette, stripes] of STRIPES) {
      const paint = gateStripes(stripes)!;
      const bands = [...paint.matchAll(/(#[0-9A-Fa-f]{6}) (\S+) (\S+?)(?:,|\))/g)].map((m) => [m[1], m[2], m[3]]);
      expect(bands.map((b) => b[0]), palette).toEqual(stripes);
      const step = 100 / stripes.length;
      bands.forEach(([, from, to], i) => {
        expect(parseFloat(from), `${palette} band ${i}`).toBeCloseTo(i * step, 2);
        expect(parseFloat(to), `${palette} band ${i}`).toBeCloseTo((i + 1) * step, 2);
      });
    }
  });

  it('keeps the bisexual 2:1:2 out of its doubled stops', () => {
    const paint = gateStripes(STRIPES.get('bisexual')!)!;
    expect(paint.match(/#D60270/g)).toHaveLength(2);
    expect(paint.match(/#0038A8/g)).toHaveLength(2);
  });

  it('draws the corner sun ring per stripe with the black seam outside each', () => {
    const stripes = STRIPES.get('trans')!;
    const paint = gateSun(stripes, '62px')!;
    expect(paint).toMatch(/^radial-gradient\(circle 62px at 100% 0,/);
    expect(paint.match(/#000 calc/g)).toHaveLength(stripes.length);
    /* Innermost stripe first from the centre. */
    expect(paint.indexOf(stripes.at(-1)!)).toBeLessThan(paint.indexOf('#F5A9B8'));
  });

  it('draws nothing for a flag it has not been told', () => {
    expect(gateStripes([])).toBeUndefined();
    expect(gateSun([], '10px')).toBeUndefined();
  });
});
