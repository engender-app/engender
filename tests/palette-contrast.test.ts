import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync('src/lib/theme/palettes.css', 'utf8');

const PALETTES = ['trans', 'nonbinary', 'genderfluid', 'bisexual', 'lesbian', 'pansexual', 'rainbow', 'agender'];
const THEMES = ['light', 'dark'] as const;

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
});