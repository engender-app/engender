import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync('src/lib/theme/palettes.css', 'utf8');

const PALETTES = ['trans', 'nonbinary', 'genderfluid', 'bisexual', 'lesbian', 'pansexual', 'rainbow', 'agender'];
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

function toRgb(hex: string) {
  const raw = hex.slice(1);
  return {
    r: Number.parseInt(raw.slice(0, 2), 16),
    g: Number.parseInt(raw.slice(2, 4), 16),
    b: Number.parseInt(raw.slice(4, 6), 16)
  };
}

function linear(n: number) {
  const s = n / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string) {
  const { r, g, b } = toRgb(hex);
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

function contrast(a: string, b: string) {
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (lighter + 0.05) / (darker + 0.05);
}

/* ---- OKLab color-mix, replicated to evaluate the heat-map ramp's
   `color-mix(in oklab, ...)` formulas the same way a browser would. ---- */
function srgbToLinear(c: number) {
  c /= 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}
function linearToSrgb(c: number) {
  c = Math.max(0, Math.min(1, c));
  return c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055;
}
function rgbToOklab([r, g, b]: number[]) {
  const [lr, lg, lb] = [srgbToLinear(r), srgbToLinear(g), srgbToLinear(b)];
  const l = 0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb;
  const m = 0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb;
  const s = 0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb;
  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);
  return [
    0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
    1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
    0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_
  ];
}
function oklabToRgb([L, a, b]: number[]) {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ ** 3;
  const m = m_ ** 3;
  const s = s_ ** 3;
  const lr = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const lg = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const lb = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
  return [linearToSrgb(lr) * 255, linearToSrgb(lg) * 255, linearToSrgb(lb) * 255];
}
function toHex(rgb: number[]) {
  return (
    '#' +
    rgb
      .map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0'))
      .join('')
  );
}
/** `color-mix(in oklab, hexA pctA%, hexB)` as the browser evaluates it. */
function colorMixOklab(hexA: string, pctA: number, hexB: string) {
  const a = rgbToOklab(Object.values(toRgb(hexA)));
  const b = rgbToOklab(Object.values(toRgb(hexB)));
  const t = pctA / 100;
  return toHex(oklabToRgb([0, 1, 2].map((i) => a[i] * t + b[i] * (1 - t))));
}

/** heat-0..4 hex for a palette/theme, matching palettes.css's formulas. */
function heatRamp(palette: string, theme: (typeof THEMES)[number]) {
  const t = tokenMap(palette, theme);
  return [
    t['surface-2'],
    colorMixOklab(t.accent, 22, t['surface-2']),
    colorMixOklab(t.accent, 45, t['surface-2']),
    colorMixOklab(t.accent, 70, t['surface-2']),
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