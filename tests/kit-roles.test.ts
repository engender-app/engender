/* Section colour, from the flag (phase 5 ticket 20). Two things are worth
   holding to a number here.

   The de-duplication: a symmetric flag lists its stripes twice, so a screen
   handed the raw --motif-stripes list gives two of its areas the same
   colour while thinking they differ. Trans reads blue/pink/white/pink/blue
   and has three roles, not five.

   And the ink. A flag has a white band and a near-black one, and each of
   those is invisible on one of the two themes, so a role writes with its
   stripe mixed toward --text rather than with the stripe itself. That mix
   is one constant in kit.css covering 8 palettes x 2 themes x every stripe
   in every flag, on every surface those roles land on - which is only safe
   because it is checked here rather than eyeballed on the default palette. */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { chromaOf, colorMixOklab, contrast, lightnessOf, toRgb } from '../src/lib/theme/colour';
import {
  ROLE_TINT_PCT,
  ROLE_WASH_PCT,
  flagRoles,
  legibleInk,
  roleAt,
  stripeRoles
} from '../src/lib/theme/roles';

const palettes = readFileSync('src/lib/theme/palettes.css', 'utf8');
const kit = readFileSync('src/lib/styles/kit.css', 'utf8');

/** How far a derived colour has moved from its stripe, in OKLab lightness,
    which is the only axis either of them moves along. */
function distance(a: string, b: string): number {
  return Math.abs(lightnessOf(a) - lightnessOf(b));
}

const PALETTES = [
  'trans',
  'nonbinary',
  'genderfluid',
  'bisexual',
  'lesbian',
  'pansexual',
  'rainbow',
  'agender'
];
const THEMES = ['light', 'dark'] as const;

function block(selector: string): string {
  return new RegExp(String.raw`${selector}\s*\{([\s\S]*?)\}`, 'm').exec(palettes)?.[1] ?? '';
}

function stripesOf(palette: string): string[] {
  const raw = /--motif-stripes:\s*([^;]+);/.exec(block(String.raw`\[data-palette="${palette}"\]`));
  if (!raw) throw new Error(`No --motif-stripes for ${palette}`);
  return raw[1].split(',').map((s) => s.trim());
}

function tokensOf(palette: string, theme: string): Record<string, string> {
  const body = block(String.raw`\[data-palette="${palette}"\]\[data-theme="${theme}"\]`);
  const out: Record<string, string> = {};
  for (const match of body.matchAll(/--([a-z0-9-]+):\s*(#[0-9A-Fa-f]{6})/g)) out[match[1]] = match[2];
  return out;
}

/** The stripe percentage in kit.css's fallback ink - the mix a surface
    falls back to when it is handed a stripe with no ink beside it. Read out
    of the stylesheet rather than repeated here: changing the mix in the CSS
    should move this test with it instead of leaving it asserting a number
    nobody kept in step. */
function roleInkPercent(): number {
  const raw = /--role-ink:\s*var\(--role-ink-in,\s*color-mix\(in oklab,\s*var\(--role-c\)\s*(\d+)%,\s*var\(--text\)\)\)/.exec(
    kit
  );
  if (!raw) throw new Error('kit.css no longer derives --role-ink as a mix of --role-c into --text');
  return Number(raw[1]);
}

/** The same, for the tinted fills a role paints behind itself. Both are
    mixed from the ink rather than from the raw stripe, so a white band
    still leaves a fill that is there. */
function tintPercent(token: 'role-tint' | 'role-wash'): number {
  const raw = new RegExp(
    String.raw`--${token}:\s*color-mix\(in oklab,\s*var\(--role-(?:ink|mark)\)\s*(\d+)%`
  ).exec(kit);
  if (!raw) throw new Error(`kit.css no longer derives --${token} from a role colour`);
  return Number(raw[1]);
}

describe('stripeRoles', () => {
  it('collapses a symmetric flag to the colours it actually has', () => {
    expect(stripeRoles(['#5BCEFA', '#F5A9B8', '#FFFFFF', '#F5A9B8', '#5BCEFA'])).toEqual([
      '#5BCEFA',
      '#F5A9B8',
      '#FFFFFF'
    ]);
  });

  it("collapses bisexual's doubled stops without losing its third colour", () => {
    expect(stripeRoles(['#D60270', '#D60270', '#9B4F96', '#0038A8', '#0038A8'])).toEqual([
      '#D60270',
      '#9B4F96',
      '#0038A8'
    ]);
  });

  it('keeps the outermost stripe first, so role 1 is the same colour every visit', () => {
    for (const palette of PALETTES) {
      expect(stripeRoles(stripesOf(palette))[0]).toBe(stripesOf(palette)[0]);
    }
  });

  it("hands a screen the flag's colours before its shades", () => {
    // A screen gives role 1 to its first area. On trans that stripe order
    // would make it the white band, and the first coloured thing on the
    // screen would be grey. The shades follow rather than being dropped.
    for (const palette of PALETTES) {
      const tokens = tokensOf(palette, 'light');
      const roles = flagRoles(stripesOf(palette), tokens.text, [tokens.bg, tokens.surface]);
      const chroma = roles.map((r) => chromaOf(r.stripe) >= 0.02);
      expect(chroma.indexOf(false) === -1 || chroma.lastIndexOf(true) < chroma.indexOf(false)).toBe(
        true
      );
      expect(roles.length).toBe(stripeRoles(stripesOf(palette)).length);
    }
  });

  it('matches on the colour rather than on how it was written', () => {
    expect(stripeRoles([' #ffffff ', '#FFFFFF'])).toEqual(['#ffffff']);
  });

  it('gives every one of the 8 flags at least three roles', () => {
    for (const palette of PALETTES) {
      expect(stripeRoles(stripesOf(palette)).length).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('roleAt', () => {
  it('wraps, so a screen with more areas than the flag has stripes still colours them all', () => {
    const roles = flagRoles(['#FF218C', '#FFD800', '#21B1FF'], '#131019', ['#F8F6FB']);
    expect(roleAt(roles, 0)?.stripe).toBe('#FF218C');
    expect(roleAt(roles, 4)?.stripe).toBe('#FFD800');
  });

  it('has nothing to give when the flag is missing, and says so', () => {
    expect(roleAt([], 0)).toBeUndefined();
  });
});

describe('the two colours a role carries', () => {
  const grounds = (t: Record<string, string>) => [t.bg, t.surface, t['surface-2']];

  /* Every ground a role lands on: the page, both card surfaces, and the two
     fills a role paints behind itself. Both fills are mixed from the mark,
     because that is what kit.css derives them from. */
  function allGrounds(tokens: Record<string, string>, role: { mark: string }) {
    return [
      ...grounds(tokens),
      colorMixOklab(role.mark, ROLE_TINT_PCT, tokens.surface),
      colorMixOklab(role.mark, ROLE_WASH_PCT, tokens.bg)
    ];
  }

  for (const palette of PALETTES) {
    for (const theme of THEMES) {
      it(`inks small text to 4.5:1 and marks to 3:1, ${palette} ${theme}`, () => {
        const tokens = tokensOf(palette, theme);
        for (const role of flagRoles(stripesOf(palette), tokens.text, grounds(tokens))) {
          for (const ground of allGrounds(tokens, role)) {
            expect(
              contrast(role.ink, ground),
              `${palette}/${theme} ${role.stripe} inked ${role.ink} on ${ground}`
            ).toBeGreaterThanOrEqual(4.5);
            expect(
              contrast(role.mark, ground),
              `${palette}/${theme} ${role.stripe} marked ${role.mark} on ${ground}`
            ).toBeGreaterThanOrEqual(3);
          }
        }
      });

      it(`never walks a mark further from the flag than the label, ${palette} ${theme}`, () => {
        const tokens = tokensOf(palette, theme);
        for (const role of flagRoles(stripesOf(palette), tokens.text, grounds(tokens))) {
          expect(
            distance(role.mark, role.stripe),
            `${palette}/${theme} ${role.stripe}`
          ).toBeLessThanOrEqual(distance(role.ink, role.stripe) + 0.001);
        }
      });
    }
  }

  it('keeps a mark nearer the flag wherever the stripe has to move at all', () => {
    /* The whole reason there are two. A bright stripe on a dark theme
       already clears both floors and neither colour moves; the difference
       shows on the theme where the stripe is close to its ground. Trans
       pink on the light theme is the case the second round was looking at
       when it said the colours did not relate to the flag. */
    const light = tokensOf('trans', 'light');
    const roles = flagRoles(stripesOf('trans'), light.text, [
      light.bg,
      light.surface,
      light['surface-2']
    ]);
    const pink = roles.find((r) => r.stripe === '#F5A9B8')!;
    expect(distance(pink.mark, pink.stripe)).toBeLessThan(distance(pink.ink, pink.stripe) - 0.05);
  });

  it('leaves a stripe alone where the stripe already reads', () => {
    expect(legibleInk('#000000', '#1B2B36', ['#FFFFFF'])).toBe('#000000');
  });

  it('keeps the hue, which is the whole reason it moves lightness', () => {
    // Rainbow red on a dark theme: darker or lighter red, never pink.
    const ink = legibleInk('#E40303', '#EFEAF6', ['#131019', '#1C1725']);
    const { r, g, b } = toRgb(ink);
    expect(r).toBeGreaterThan(g + 40);
    expect(r).toBeGreaterThan(b + 40);
  });
});

describe("kit.css's fallback ink", () => {
  const ink = roleInkPercent();

  it('mixes its fills at the percentages roles.ts computes the ink against', () => {
    expect(tintPercent('role-tint')).toBe(ROLE_TINT_PCT);
    expect(tintPercent('role-wash')).toBe(ROLE_WASH_PCT);
  });

  it('is a mix toward --text rather than a raw stripe', () => {
    expect(ink).toBeGreaterThan(0);
    expect(ink).toBeLessThan(100);
  });

  for (const palette of PALETTES) {
    for (const theme of THEMES) {
      it(`clears 4.5:1 with no ink supplied, ${palette} ${theme}`, () => {
        const tokens = tokensOf(palette, theme);
        for (const stripe of stripeRoles(stripesOf(palette))) {
          const inked = colorMixOklab(stripe, ink, tokens.text);
          for (const ground of [
            tokens.bg,
            tokens.surface,
            tokens['surface-2'],
            colorMixOklab(inked, tintPercent('role-tint'), tokens.surface),
            colorMixOklab(inked, tintPercent('role-wash'), tokens.bg)
          ]) {
            expect(
              contrast(inked, ground),
              `${palette}/${theme} stripe ${stripe} on ${ground}`
            ).toBeGreaterThanOrEqual(4.5);
          }
        }
      });
    }
  }
});
