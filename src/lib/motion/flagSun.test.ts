import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { SUN_OUTER, parseMotifStripes, ringColour, sunRings } from './flagSun';

const root = fileURLToPath(new URL('../../../', import.meta.url));

/** Reads the app's real `--motif-stripes` per palette from the stylesheet
    itself, so this test exercises the same 8 flags production does rather
    than a second, hand-copied list that could drift from palettes.css. */
function realPalettes(): Record<string, string[]> {
  const css = readFileSync(join(root, 'src/lib/theme/palettes.css'), 'utf8');
  const out: Record<string, string[]> = {};
  for (const match of css.matchAll(/\[data-palette="([^"]+)"\]\s*\{\s*--motif-stripes:\s*([^;]+);/g)) {
    out[match[1]] = parseMotifStripes(match[2]);
  }
  return out;
}

const palettes = realPalettes();

describe('sunRings', () => {
  it('finds all 8 palettes to test against - the parser has drifted otherwise', () => {
    expect(Object.keys(palettes)).toHaveLength(8);
  });

  it('makes one ring per stripe, in the flag\'s own order, for every palette in both themes', () => {
    for (const [name, stripes] of Object.entries(palettes)) {
      for (const dark of [false, true]) {
        const rings = sunRings(stripes, dark);
        expect(rings, name).toHaveLength(stripes.length);
      }
    }
  });

  it('gives every flag the same outer diameter and an innermost ring one band wide', () => {
    for (const [name, stripes] of Object.entries(palettes)) {
      const rings = sunRings(stripes, false);
      expect(rings[0].diameter, `${name} outermost`).toBe(SUN_OUTER);
      expect(rings.at(-1)!.diameter, `${name} innermost`).toBeCloseTo(SUN_OUTER / stripes.length);
    }
  });

  it('steps every ring down by the same radial thickness', () => {
    for (const [name, stripes] of Object.entries(palettes)) {
      const rings = sunRings(stripes, false);
      const band = SUN_OUTER / stripes.length;
      for (let i = 1; i < rings.length; i++) {
        expect(rings[i - 1].diameter - rings[i].diameter, `${name} ring ${i}`).toBeCloseTo(band);
      }
    }
  });

  it('offsets the entrance 0.11s per ring, outside-in, and the breathe 0.85s behind that', () => {
    const rings = sunRings(palettes.rainbow, false);
    rings.forEach((ring, i) => {
      expect(ring.inDelay).toBeCloseTo(i * 0.11);
      expect(ring.breatheDelay).toBeCloseTo(i * 0.11 + 0.85);
    });
  });

  it("bisexual's doubled stops give two adjacent same-colour rings, its 2:1:2 for free", () => {
    const rings = sunRings(palettes.bisexual, false);
    expect(rings.map((r) => r.color)).toEqual(['#D60270', '#D60270', '#9B4F96', '#0038A8', '#0038A8']);
  });
});

describe('ringColour', () => {
  it('nudges near-black stripes toward grey on dark, and leaves them on light', () => {
    for (const black of ['#000000', '#1A1A1A', '#2C2C2C', '#2F2F2F']) {
      expect(ringColour(black, true), black).toBe('#524C5E');
      expect(ringColour(black, false), black).toBe(black);
    }
  });

  it('nudges white toward grey on light, and leaves it on dark', () => {
    expect(ringColour('#FFFFFF', false)).toBe('#DAD4DF');
    expect(ringColour('#FFFFFF', true)).toBe('#FFFFFF');
  });

  it('nudges both yellows on light, and leaves them on dark', () => {
    for (const yellow of ['#FCF434', '#FFED00']) {
      expect(ringColour(yellow, false), yellow).toBe('#E3D300');
      expect(ringColour(yellow, true), yellow).toBe(yellow);
    }
  });

  it('is case-insensitive', () => {
    expect(ringColour('#ffffff', false)).toBe('#DAD4DF');
  });

  it('leaves every other stripe exactly as the flag has it', () => {
    expect(ringColour('#5BCEFA', true)).toBe('#5BCEFA');
    expect(ringColour('#F5A9B8', false)).toBe('#F5A9B8');
  });

  it('nudges every near-black or near-white stripe the 8 real palettes actually use', () => {
    for (const [name, stripes] of Object.entries(palettes)) {
      for (const dark of [false, true]) {
        const rings = sunRings(stripes, dark);
        rings.forEach((ring, i) => {
          const hex = stripes[i].toUpperCase();
          const invisible =
            (dark && ['#000000', '#1A1A1A', '#2C2C2C', '#2F2F2F'].includes(hex)) ||
            (!dark && hex === '#FFFFFF');
          if (invisible) expect(ring.color, `${name}[${i}] on ${dark ? 'dark' : 'light'}`).not.toBe(hex);
        });
      }
    }
  });
});

describe('parseMotifStripes', () => {
  it('splits and trims a bare comma list', () => {
    expect(parseMotifStripes(' #FFFFFF,  #000000 ,#123456')).toEqual(['#FFFFFF', '#000000', '#123456']);
  });

  it('drops empty entries from a trailing comma or blank value', () => {
    expect(parseMotifStripes('#FFFFFF,,')).toEqual(['#FFFFFF']);
    expect(parseMotifStripes('')).toEqual([]);
  });
});
