/* sRGB, OKLab and WCAG contrast, for the one job in the app that has to
   reason about a colour rather than name one: making a flag stripe legible
   as a label (see roles.ts).

   The palette itself is authored by hand and checked by
   tests/palette-contrast.test.ts, which reads these same functions, so the
   arithmetic that decides a colour at runtime and the arithmetic that
   guards the stylesheet are one implementation rather than two that agree
   until they do not.

   OKLab rather than sRGB because that is the space `color-mix(in oklab,
   ...)` works in throughout palettes.css, and because lightness in OKLab is
   perceptual: nudging L moves a colour toward or away from its background
   without dragging its hue with it. */

interface Rgb {
  r: number;
  g: number;
  b: number;
}

export function toRgb(hex: string): Rgb {
  const raw = hex.trim().replace('#', '');
  return {
    r: Number.parseInt(raw.slice(0, 2), 16),
    g: Number.parseInt(raw.slice(2, 4), 16),
    b: Number.parseInt(raw.slice(4, 6), 16)
  };
}

function srgbToLinear(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function linearToSrgb(c: number): number {
  const clamped = Math.max(0, Math.min(1, c));
  return clamped <= 0.0031308 ? clamped * 12.92 : 1.055 * clamped ** (1 / 2.4) - 0.055;
}

export function luminance(hex: string): number {
  const { r, g, b } = toRgb(hex);
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}

/** WCAG 2 contrast ratio, 1 to 21. */
export function contrast(a: string, b: string): number {
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (lighter + 0.05) / (darker + 0.05);
}

function rgbToOklab({ r, g, b }: Rgb): number[] {
  const lr = srgbToLinear(r);
  const lg = srgbToLinear(g);
  const lb = srgbToLinear(b);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  ];
}

function oklabToRgb([L, a, b]: number[]): number[] {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    linearToSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s) * 255,
    linearToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s) * 255,
    linearToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s) * 255
  ];
}

function toHex(rgb: number[]): string {
  return (
    '#' +
    rgb
      .map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0'))
      .join('')
  );
}

/** `color-mix(in oklab, hexA pctA%, hexB)`, as the browser evaluates it. */
export function colorMixOklab(hexA: string, pctA: number, hexB: string): string {
  const a = rgbToOklab(toRgb(hexA));
  const b = rgbToOklab(toRgb(hexB));
  const t = pctA / 100;
  return toHex(oklabToRgb([0, 1, 2].map((i) => a[i] * t + b[i] * (1 - t))));
}

/** The same colour at a different OKLab lightness: hue and chroma survive,
    which is the whole reason this is here rather than a mix toward black or
    white. Mixing a saturated stripe toward the theme's text colour drags it
    to grey on the way; moving its lightness leaves red red. */
export function withLightness(hex: string, lightness: number): string {
  const [, a, b] = rgbToOklab(toRgb(hex));
  return toHex(oklabToRgb([Math.max(0, Math.min(1, lightness)), a, b]));
}

export function lightnessOf(hex: string): number {
  return rgbToOklab(toRgb(hex))[0];
}

/** How far a colour is from grey, in OKLab. A flag's white and near-black
    bands come out at essentially zero; every hue it carries does not. */
export function chromaOf(hex: string): number {
  const [, a, b] = rgbToOklab(toRgb(hex));
  return Math.hypot(a, b);
}
