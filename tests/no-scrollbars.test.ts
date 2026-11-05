/* No scrollbar is ever drawn in the app (Alicja, 2026-11-04, prh12). One
   global rule hides them all, and nothing may bring one back: a class that
   sets its own scrollbar-width outranks the `*` rule, and a reserved
   `scrollbar-gutter` would leave an empty strip where the bar was. */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('..', import.meta.url));
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = dir + '/' + name;
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
const sources = walk(root + 'src').filter((p) => /\.(css|svelte)$/.test(p));

describe('no scrollbars', () => {
  it('hides every scrollbar from one global rule', () => {
    const app = readFileSync(root + 'src/lib/styles/app.css', 'utf8');
    expect(app).toMatch(/^\*\s*\{\s*scrollbar-width:\s*none;\s*\}/m);
    expect(app).toMatch(/^\*::-webkit-scrollbar\s*\{\s*display:\s*none;\s*\}/m);
  });

  it('never asks for a visible scrollbar or reserves a gutter for one', () => {
    for (const file of sources) {
      const css = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
      expect(css, file).not.toMatch(/scrollbar-width:\s*(thin|auto)/);
      expect(css, file).not.toMatch(/scrollbar-gutter:/);
    }
  });
});
