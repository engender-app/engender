import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { SUN_OUTER, parseMotifStripes, sunRings } from './flagSun';

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

describe('the flag is the flag', () => {
  /* The rule, stated twice and without qualification (Alicja, 2026-08-25):
     every colour drawn as the flag is the flag's own hex. There used to be a
     per-theme nudge in this file - a near-black band lifted on the dark theme,
     white and the two yellows dulled on the light one - so that a band which
     nearly matches the page would still read. It is gone, and this is what
     keeps it gone: a substitution reintroduced anywhere in the ring path fails
     here rather than being noticed on a screenshot months later.

     Held against `--motif-stripes` itself rather than a list written out here,
     so the assertion is "the sun draws what palettes.css says" and cannot
     drift from the flags the app actually ships. */
  for (const theme of [true, false]) {
    it(`draws every stripe of all 8 palettes at its exact hex, ${theme ? 'dark' : 'light'}`, () => {
      for (const [name, stripes] of Object.entries(palettes)) {
        const drawn = sunRings(stripes, theme).map((ring) => ring.color);
        expect(drawn, name).toEqual(stripes);
      }
    });
  }

  it('is the same set of colours whichever theme is showing', () => {
    // The pair that made the nudge tempting: trans's white on light, agender's
    // black on dark. Neither moves now.
    for (const [name, stripes] of Object.entries(palettes)) {
      expect(sunRings(stripes, true).map((r) => r.color), name).toEqual(
        sunRings(stripes, false).map((r) => r.color)
      );
    }
    expect(palettes.trans).toContain('#FFFFFF');
  });
});
