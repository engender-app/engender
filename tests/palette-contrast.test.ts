import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { chromaOf, colorMixOklab, contrast, hueOf, lightnessOf } from '../src/lib/theme/colour';
import { bandRoles, flagField, flagRoles } from '../src/lib/theme/roles';
import { PALETTES } from './palettes.mjs';

const css = readFileSync('src/lib/theme/palettes.css', 'utf8');

const THEMES = ['light', 'dark'] as const;
const MOOD_PRESETS = ['amber', 'teal', 'plum', 'moss'];

function tokenMap(palette: string, theme: (typeof THEMES)[number]) {
  const block = new RegExp(
    String.raw`\[data-palette="${palette}"\]\[data-theme="${theme}"\]\s*\{([\s\S]*?)\}`,
    'm'
  ).exec(css)?.[1];
  if (!block) throw new Error(`Missing token block for ${palette}/${theme}`);

  const out: Record<string, string> = {};
  for (const match of block.matchAll(/--([a-z0-9-]+):\s*(#[0-9A-Fa-f]{6})/g)) {
    out[match[1]] = match[2];
  }
  return out;
}

/** Raw declaration text (not just literal hex) for a token in a given block,
    so callers can also see `var(--other-token)` references. */
function rawDeclaration(block: string, prop: string): string | undefined {
  return new RegExp(String.raw`--${prop}:\s*([^;]+);`).exec(block)?.[1]?.trim();
}

function blockBody(selector: string): string {
  return new RegExp(String.raw`${selector}\s*\{([\s\S]*?)\}`, 'm').exec(css)?.[1] ?? '';
}

function moodPresetTokenMap(preset: string, theme: (typeof THEMES)[number]) {
  const block = blockBody(String.raw`\[data-mood-preset="${preset}"\]\[data-theme="${theme}"\]`);
  if (!block) throw new Error(`Missing mood preset block for ${preset}/${theme}`);
  const out: Record<string, string> = {};
  for (const match of block.matchAll(/--([a-z0-9-]+):\s*(#[0-9A-Fa-f]{6})/g)) {
    out[match[1]] = match[2];
  }
  return out;
}

/** A preset's five steps, in order, for a theme. */
function moodRamp(preset: string, theme: (typeof THEMES)[number]) {
  const tokens = moodPresetTokenMap(preset, theme);
  return [1, 2, 3, 4, 5].map((step) => tokens[`mood-${step}`]);
}

/** Signed shorter way round the wheel, from one hue to another. */
function hueGap(from: number, to: number) {
  return ((to - from + 540) % 360) - 180;
}

/** How far apart two colours are in OKLab, out of the polar readings the
    token layer already exposes: two chromas and the angle between them are
    a triangle, and the lightnesses are the third dimension. */
function oklabDistance(a: string, b: string) {
  const [ca, cb] = [chromaOf(a), chromaOf(b)];
  const angle = (hueGap(hueOf(a), hueOf(b)) * Math.PI) / 180;
  const flat = ca * ca + cb * cb - 2 * ca * cb * Math.cos(angle);
  return Math.hypot(lightnessOf(a) - lightnessOf(b), Math.sqrt(Math.max(0, flat)));
}

/** The accent percentage in `--heat-N: color-mix(in oklab, var(--accent)
    N%, var(--surface-2))`, read out of :root rather than hardcoded - so a
    ramp change in the CSS is a ramp change here too, not a silently stale
    assumption. */
function heatStepPercent(step: 1 | 2 | 3) {
  const raw = rawDeclaration(blockBody(':root'), `heat-${step}`)!;
  const match = /var\(--accent\)\s*(\d+)%/.exec(raw);
  if (!match) throw new Error(`Could not read the accent percentage out of --heat-${step}: ${raw}`);
  return Number(match[1]);
}

/** The accent percentage in a `color-mix(in oklab, var(--accent) N%,
    var(--text))` token, read out of :root for the same reason
    heatStepPercent() reads the ramp there: a formula change in the CSS
    should move this test with it rather than leave it asserting a number
    nobody kept in step. */
function accentMixPercent(token: string) {
  const raw = rawDeclaration(blockBody(':root'), token)!;
  const match = /var\(--accent\)\s*(\d+)%/.exec(raw);
  if (!match) throw new Error(`Could not read the accent percentage out of --${token}: ${raw}`);
  return Number(match[1]);
}

/** heat-0..4 hex for a palette/theme, matching palettes.css's formulas. */
function heatRamp(palette: string, theme: (typeof THEMES)[number]) {
  const t = tokenMap(palette, theme);
  return [
    t['surface-2'],
    colorMixOklab(t.accent, heatStepPercent(1), t['surface-2']),
    colorMixOklab(t.accent, heatStepPercent(2), t['surface-2']),
    colorMixOklab(t.accent, heatStepPercent(3), t['surface-2']),
    t.accent
  ];
}

/** Resolves an --on-heat-N declaration (a literal hex or a `var(--x)`
    reference into the same palette/theme's token map) to a literal hex. */
function resolveOnHeat(raw: string, tokens: Record<string, string>) {
  const varMatch = /^var\(--([a-z0-9-]+)\)$/.exec(raw);
  if (!varMatch) return raw;
  const value = tokens[varMatch[1]];
  if (!value) throw new Error(`Could not resolve var(--${varMatch[1]})`);
  return value;
}

/** on-heat-0..4 for a palette/theme: the cascade is :root (generic default)
    -> [data-theme=X] (theme-level default) -> [data-palette=Y][data-theme=X]
    (palette override, highest specificity) - the same order the browser
    resolves custom properties in, so any step can be overridden at any
    level without the test needing to know which ones actually are. */
function onHeatRamp(palette: string, theme: (typeof THEMES)[number]) {
  const tokens = tokenMap(palette, theme);
  /* (?<!\]) so this matches the standalone `[data-theme="X"] {...}` block
     and not the tail end of a compound `[data-palette="Y"][data-theme="X"]`
     selector, which contains the same substring immediately before `{`. */
  const themeOnlySelector = String.raw`(?<!\])\[data-theme="${theme}"\]`;
  const onAccent = rawDeclaration(blockBody(themeOnlySelector), 'on-accent')!;
  const withOnAccent = { ...tokens, 'on-accent': resolveOnHeat(onAccent, tokens) };

  const rootBlock = blockBody(':root');
  const themeBlock = blockBody(themeOnlySelector);
  const paletteBlock = blockBody(String.raw`\[data-palette="${palette}"\]\[data-theme="${theme}"\]`);

  return [0, 1, 2, 3, 4].map((step) => {
    const raw =
      rawDeclaration(paletteBlock, `on-heat-${step}`) ??
      rawDeclaration(themeBlock, `on-heat-${step}`) ??
      rawDeclaration(rootBlock, `on-heat-${step}`)!;
    return resolveOnHeat(raw, withOnAccent);
  });
}

describe('palette contrast coverage', () => {
  it('declares all eight palettes and both themes', () => {
    for (const palette of PALETTES) {
      for (const theme of THEMES) {
        expect(() => tokenMap(palette, theme)).not.toThrow();
      }
    }
  });

  it('keeps body text readable against the three main surfaces in every palette and theme', () => {
    for (const palette of PALETTES) {
      for (const theme of THEMES) {
        const t = tokenMap(palette, theme);
        const pairs: Array<[string, string, number]> = [
          ['text', 'bg', 4.5],
          ['text', 'surface', 4.5],
          ['text', 'surface-2', 4.5],
          ['text-2', 'bg', 3.0],
          ['text-2', 'surface', 3.0],
          ['text-2', 'surface-2', 3.0]
        ];

        for (const [fg, bg, min] of pairs) {
          const ratio = contrast(t[fg], t[bg]);
          expect(
            ratio,
            `${palette}/${theme}: ${fg} on ${bg} has ${ratio.toFixed(2)}:1, needs ${min}:1`
          ).toBeGreaterThanOrEqual(min);
        }
      }
    }
  });

  it('declares all four mood presets and both themes', () => {
    for (const preset of MOOD_PRESETS) {
      for (const theme of THEMES) {
        expect(() => moodPresetTokenMap(preset, theme)).not.toThrow();
      }
    }
  });

  /* COL-001/ADR-0025: mood is drawn as a face (eyes, mouth) in --text on top
     of a --mood-N fill, so it carries the same 4.5:1 promise the rest of the
     token layer does. The scale is fixed per preset+theme rather than
     derived from the palette, but the promise still has to hold against
     every palette's own --text - hence the full cross product. */
  it('keeps every mood-preset x palette x theme combination at 4.5:1 or better', () => {
    for (const preset of MOOD_PRESETS) {
      for (const theme of THEMES) {
        const mood = moodPresetTokenMap(preset, theme);
        for (const palette of PALETTES) {
          const text = tokenMap(palette, theme).text;
          for (let step = 1; step <= 5; step++) {
            const ratio = contrast(mood[`mood-${step}`], text);
            expect(
              ratio,
              `${preset}/${theme} mood-${step} vs ${palette}'s --text has ${ratio.toFixed(2)}:1, needs 4.5:1`
            ).toBeGreaterThanOrEqual(4.5);
          }
        }
      }
    }
  });

  /* ADR-0077: each preset runs between two deliberately chosen hues instead
     of tinting one, so "two colours, not one" is the claim these three hold.
     Read on the shipped hexes, in OKLab, which is the space palettes.css
     mixes in.

     Hue distance is where the two-hue reading comes from; monotone travel is
     what keeps it a gradient rather than a wander through a third hue the
     ends do not sit either side of; and rising chroma is the "how much"
     channel mood keeps whichever way the hue goes - in the dark theme it is
     the only one it has, because the luminance ceiling there is what stops
     the ramp descending (ADR-0077's band). */
  it('runs every mood preset between two hues at least 60 degrees apart', () => {
    for (const preset of MOOD_PRESETS) {
      for (const theme of THEMES) {
        const ramp = moodRamp(preset, theme);
        const gap = Math.abs(hueGap(hueOf(ramp[0]), hueOf(ramp[4])));
        expect(
          gap,
          `${preset}/${theme} runs ${hueOf(ramp[0]).toFixed(0)} deg to ${hueOf(ramp[4]).toFixed(
            0
          )} deg, which is ${gap.toFixed(0)} deg of travel - one hue tinted, not two`
        ).toBeGreaterThanOrEqual(60);
      }
    }
  });

  it('travels one way round the wheel, never through a third hue', () => {
    for (const preset of MOOD_PRESETS) {
      for (const theme of THEMES) {
        const hues = moodRamp(preset, theme).map(hueOf);
        const whole = hueGap(hues[0], hues[4]);
        for (let step = 1; step < 5; step++) {
          const leg = hueGap(hues[step - 1], hues[step]);
          expect(
            Math.sign(leg) === Math.sign(whole) && Math.abs(leg) < Math.abs(whole),
            `${preset}/${theme} turns back on itself between steps ${step} and ${step + 1}: ${leg.toFixed(
              0
            )} deg against the ramp's ${whole.toFixed(0)}`
          ).toBe(true);
        }
      }
    }
  });

  /* "How much" is the other half of the ramp's job, and with the hue moving
     it cannot be read off lightness alone: the light theme descends as it
     saturates, and the dark theme cannot descend at all (its band is a
     ceiling, and a gold at the bottom of it is a brown), so it holds one
     lightness and spends chroma. What both have to be is five colours a
     person can tell apart, which is one measurement rather than two rules -
     the OKLab distance between neighbours. 0.031 is the smallest the shipped
     ramps have, on teal dark's first pair. */
  it('keeps every neighbouring pair of steps a visibly different colour', () => {
    for (const preset of MOOD_PRESETS) {
      for (const theme of THEMES) {
        const ramp = moodRamp(preset, theme);
        for (let step = 1; step < 5; step++) {
          const gap = oklabDistance(ramp[step - 1], ramp[step]);
          expect(
            gap,
            `${preset}/${theme} steps ${step} and ${step + 1} are ${gap.toFixed(
              3
            )} apart in OKLab (${ramp[step - 1]} and ${ramp[step]})`
          ).toBeGreaterThanOrEqual(0.025);
        }
      }
    }
  });

  it('ends far more saturated than it starts, whichever theme is on', () => {
    for (const preset of MOOD_PRESETS) {
      for (const theme of THEMES) {
        const ramp = moodRamp(preset, theme);
        const ratio = chromaOf(ramp[4]) / chromaOf(ramp[0]);
        expect(
          ratio,
          `${preset}/${theme} only gains ${ratio.toFixed(2)}x chroma from step 1 to step 5`
        ).toBeGreaterThanOrEqual(1.5);
      }
    }
  });

  /* The one hue pair the app may not draw, ADR-0012 and palettes.css's own
     header rule: red to green is the judgment scale, and mood is the metric
     most likely to be handed one by a well-meaning edit. Both ends are
     checked, either way round. */
  it('never runs a preset from red to green', () => {
    const red = (h: number) => h < 45 || h > 340;
    const green = (h: number) => h > 120 && h < 180;
    for (const preset of MOOD_PRESETS) {
      for (const theme of THEMES) {
        const [first, , , , last] = moodRamp(preset, theme).map(hueOf);
        expect(
          (red(first) && green(last)) || (green(first) && red(last)),
          `${preset}/${theme} runs ${first.toFixed(0)} deg to ${last.toFixed(0)} deg, which is a red-green scale`
        ).toBe(false);
      }
    }
  });

  /* Ticket 17: --accent is the heat ramp's top step as well as the app's
     one accent, so it is sized to be sat on, not to be read as text. On
     trans light it measured 4.10:1 against --surface-2 and 4.38:1 against
     --bg, under the 4.5:1 floor small accent-coloured text needs.
     --accent-ink is the same hue pulled toward --text until it clears that
     floor on all three surfaces, in every palette and theme - so a section
     link or a caption can be accent-coloured without a per-palette
     exception. The ramp keeps raw --accent; this token is text only. */
  it('keeps --accent-ink readable as small text on all three surfaces in every palette and theme', () => {
    const percent = accentMixPercent('accent-ink');
    for (const palette of PALETTES) {
      for (const theme of THEMES) {
        const t = tokenMap(palette, theme);
        const ink = colorMixOklab(t.accent, percent, t.text);
        for (const surface of ['bg', 'surface', 'surface-2']) {
          const ratio = contrast(ink, t[surface]);
          expect(
            ratio,
            `${palette}/${theme}: accent-ink (${ink}) on ${surface} (${t[surface]}) has ${ratio.toFixed(2)}:1, needs 4.5:1`
          ).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
  });

  /* COL-002: the heat-map draws a day number in --on-heat-N on top of a
     --heat-N fill; heat-N is a color-mix() ramp rather than a literal, so
     this replicates the browser's OKLab mixing to check the real rendered
     colour rather than the token's source formula. */
  it('keeps every heat-map ramp step readable by its on-heat text token', () => {
    for (const palette of PALETTES) {
      for (const theme of THEMES) {
        const heat = heatRamp(palette, theme);
        const onHeat = onHeatRamp(palette, theme);
        for (let step = 0; step <= 4; step++) {
          const ratio = contrast(heat[step], onHeat[step]);
          expect(
            ratio,
            `${palette}/${theme} heat-${step} (${heat[step]}) vs on-heat-${step} (${onHeat[step]}) has ${ratio.toFixed(2)}:1, needs 4.5:1`
          ).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
  });
});

/* The phase 10 direction's two enumerations (redesign ticket 07,
   DIRECTION.md rule 11). Both are computed on the exact hexes, never read
   off a render. */
describe('the field and the fills (phase 10)', () => {
  function stripesOf(palette: string): string[] {
    const raw = /--motif-stripes:\s*([^;]+);/.exec(blockBody(String.raw`\[data-palette="${palette}"\]`));
    if (!raw) throw new Error(`No --motif-stripes for ${palette}`);
    return raw[1].split(',').map((s) => s.trim());
  }

  /* The table DIRECTION.md prints under "Contrast, measured": the flag's
     second colour, its ink, and the ratio to two places. Only large text
     sits on the field, which answers to 3:1; nonbinary's 4.41 is why. */
  const FIELD: Record<string, [string, string, number]> = {
    trans: ['#F5A9B8', '#101820', 9.59],
    nonbinary: ['#9C59D1', '#FFFFFF', 4.41],
    genderfluid: ['#C011D7', '#FFFFFF', 4.88],
    bisexual: ['#0038A8', '#FFFFFF', 9.85],
    lesbian: ['#FF9A56', '#101820', 8.53],
    pansexual: ['#FFD800', '#101820', 12.85],
    rainbow: ['#004CFF', '#FFFFFF', 6.04],
    agender: ['#B9F484', '#101820', 13.92]
  };

  it("takes the field from the flag's inner bands, never its outermost, and inks it to 3:1", () => {
    for (const palette of PALETTES) {
      const field = flagField(stripesOf(palette), palette)!;
      const stripes = stripesOf(palette).map((s) => s.toUpperCase());
      expect(field.hex.toUpperCase(), palette).not.toBe(stripes[0]);
      expect(stripes.slice(1, -1), `${palette}: the field is one of the flag's inner bands`).toContain(
        field.hex.toUpperCase()
      );
      expect(field.ratio, `${palette}: ${field.ink} on ${field.hex}`).toBeGreaterThanOrEqual(3);
      const [hex, ink, ratio] = FIELD[palette];
      expect([field.hex, field.ink, Number(field.ratio.toFixed(2))], palette).toEqual([hex, ink, ratio]);
    }
  });

  /* Two flags name their own band (Alicja, 2026-09-07: the rainbow on the
     ticket 06 renders, bisexual on ticket 23's); the other six fall to the
     rule. Without the name each would take the rule's answer, which is what
     the first expectation of each pair pins. */
  it('names the rainbow blue and the bisexual dark blue, and lets the other six fall to the rule', () => {
    expect(flagField(stripesOf('rainbow'))!.hex).toBe('#FF8C00');
    expect(flagField(stripesOf('rainbow'), 'rainbow')!.hex).toBe('#004CFF');
    expect(flagField(stripesOf('bisexual'))!.hex).toBe('#9B4F96');
    expect(flagField(stripesOf('bisexual'), 'bisexual')!.hex).toBe('#0038A8');
    expect(flagField([])).toBeUndefined();
  });

  /* Small text on a fill: a day bar's 13px date and a tag's 12px label sit
     on --role-draw in --role-fill-ink, and a day card can be handed any
     role index (on-this-day colours each year in turn), so every stripe of
     every flag has to carry that ink at 4.5:1 on both themes - not only the
     two indices Home happens to use. The ink is the one roles.ts computes
     for the heat ramp's deepest step, which is the stripe undiluted. */
  /* The voice figure's own two claims (redesign ticket 42).

     The pitch value sits on a block of the stripe at 19px bold, which is
     large text and answers to 3:1 - the floor rule 11 states, and the one
     every flag clears with nonbinary's 4.41 as the worst of the eight. It
     is the same ink and the same block the picking rows carry.

     The density is a chart mark, so it takes the stripe undiluted and owes
     no ratio at all: `kit.css`'s own note records why, in Alicja's words
     from 2026-08-25 about what a contrast floor did to nonbinary's yellow.
     What is asserted here instead is that it cannot quietly become a second,
     floored colour - the shape is the trace's colour exactly - and the
     measured worst case is pinned so that a change to either the wash or
     the stripe list shows up as a number rather than as nothing.

     Measured, both themes, every chromatic role of every flag: the outline
     against the 18 per cent band wash, against the 9 per cent middle band,
     and against the bare surface between them. The worst of all three is
     nonbinary's yellow on the light theme at 1.13:1 against its own band -
     the same 1.16:1 the pitch trace has always had against the surface, and
     the flag-colour rule working rather than a regression. */
  it('draws the density in the flag colour itself, never a floored one', () => {
    let worst = { ratio: 99, where: '' };
    for (const palette of PALETTES) {
      for (const theme of THEMES) {
        const t = tokenMap(palette, theme);
        const roles = flagRoles(stripesOf(palette), t.text, [t.bg, t.surface, t['surface-2']]);
        for (const role of roles.filter((r) => chromaOf(r.stripe) >= 0.04)) {
          for (const [what, ground] of [
            ['the band wash', colorMixOklab(role.stripe, 18, t.surface)],
            ['the middle band', colorMixOklab(role.stripe, 9, t.surface)],
            ['the bare surface', t.surface]
          ] as const) {
            const ratio = contrast(role.stripe, ground);
            if (ratio < worst.ratio) {
              worst = { ratio, where: `${palette}/${theme}: ${role.stripe} on ${what} (${ground})` };
            }
          }
        }
      }
    }
    expect(Number(worst.ratio.toFixed(2)), worst.where).toBe(1.13);
    expect(worst.where).toContain('nonbinary/light');
  });

  /* The Look back rail draws four kinds of band, and its rule is that no
     two of them share a stripe (phase 11 ticket 06). Two of those kinds -
     the HRT lane and the tryout lane - take a flag stripe each; the other
     two take no stripe at all, so the whole rule reduces to this floor. It
     is not obvious that it holds: `bandRoles` hands out colours before
     shades, and three of the eight flags yield only two colours. */
  it('gives the rail two stripes to tell its two coloured lanes apart, on every flag', () => {
    for (const palette of PALETTES) {
      for (const theme of THEMES) {
        const t = tokenMap(palette, theme);
        const bands = bandRoles(flagRoles(stripesOf(palette), t.text, [t.bg, t.surface, t['surface-2']]));
        expect(bands.length, `${palette}/${theme} yields ${bands.length} band role(s)`).toBeGreaterThanOrEqual(2);
        expect(bands[0].stripe.toUpperCase(), `${palette}/${theme}`).not.toBe(bands[1].stripe.toUpperCase());
      }
    }
  });

  it('inks the pitch value block to rule 11\'s large-text floor on every flag', () => {
    for (const palette of PALETTES) {
      for (const theme of THEMES) {
        const t = tokenMap(palette, theme);
        for (const role of flagRoles(stripesOf(palette), t.text, [t.bg, t.surface, t['surface-2']])) {
          const ink = role.heat[role.heat.length - 1].ink;
          const ratio = contrast(ink, role.stripe);
          expect(
            ratio,
            `${palette}/${theme}: the pitch value ${ink} on ${role.stripe} has ${ratio.toFixed(2)}:1`
          ).toBeGreaterThanOrEqual(3);
        }
      }
    }
  });

  it('keeps small text in the fill ink readable on every stripe of every flag, both themes', () => {
    for (const palette of PALETTES) {
      for (const theme of THEMES) {
        const t = tokenMap(palette, theme);
        const roles = flagRoles(stripesOf(palette), t.text, [t.bg, t.surface, t['surface-2']]);
        expect(roles.length).toBeGreaterThanOrEqual(3);
        for (const role of roles) {
          const ink = role.heat[role.heat.length - 1].ink;
          const ratio = contrast(ink, role.stripe);
          expect(
            ratio,
            `${palette}/${theme}: ${ink} on ${role.stripe} has ${ratio.toFixed(2)}:1`
          ).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
  });
});