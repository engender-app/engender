/* The app makes no network request of any kind, so a typeface either ships
   in static/fonts or it does not render. Two ways that quietly breaks: a
   @font-face pointing at a file that is not there, which falls back to
   system-ui and looks almost right in English; and a subset whose
   unicode-range does not reach Polish, which looks exactly right until a
   word has an ogonek in it. Both survive a visual check on an English
   screen, so they are checked here instead.

   The face files themselves are Google's own latin/latin-ext subsets, and
   tests/browser-tier/verify-build.mjs asserts all four reach the offline
   shell's precache. */

import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../', import.meta.url));
const css = readFileSync(join(root, 'src/lib/theme/fonts.css'), 'utf8');

/** Every @font-face block, as (family, src path, unicode-range). */
function faces() {
  return [...css.matchAll(/@font-face\s*\{([\s\S]*?)\}/g)].map(([, body]) => ({
    family: /font-family:\s*'([^']+)'/.exec(body)![1],
    src: /url\('([^']+)'\)/.exec(body)![1],
    range: /unicode-range:\s*([^;]+);/.exec(body)?.[1] ?? ''
  }));
}

/** The codepoints a unicode-range covers, as [from, to] pairs. */
function ranges(declaration: string): Array<[number, number]> {
  return declaration.split(',').map((part) => {
    const [from, to] = part.trim().replace(/^U\+/i, '').split('-');
    return [Number.parseInt(from, 16), Number.parseInt(to ?? from, 16)];
  });
}

const POLISH = 'ĄąĆćĘęŁłŃńÓóŚśŹźŻż';

describe('bundled typefaces', () => {
  it('ships a file for every face it declares', () => {
    for (const { family, src } of faces()) {
      const path = join(root, 'static', src.replace(/^\//, ''));
      expect(existsSync(path), `${family} declares ${src}, which is not in static/`).toBe(true);
      expect(statSync(path).size, `${src} is empty`).toBeGreaterThan(0);
    }
  });

  it('covers every Polish letter in each family, across its subsets', () => {
    const byFamily = new Map<string, Array<[number, number]>>();
    for (const { family, range } of faces()) {
      byFamily.set(family, [...(byFamily.get(family) ?? []), ...ranges(range)]);
    }

    expect(byFamily.size).toBeGreaterThan(0);
    for (const [family, covered] of byFamily) {
      const missing = [...POLISH].filter(
        (letter) => !covered.some(([from, to]) => letter.codePointAt(0)! >= from && letter.codePointAt(0)! <= to)
      );
      expect(missing, `${family}'s subsets do not reach ${missing.join('')}`).toEqual([]);
    }
  });

  /* app.html preloads the face a first paint needs. A preload for a file
     that no @font-face asks for is a wasted request the browser makes on
     every cold start and then throws away. */
  it('preloads only faces it actually declares', () => {
    const html = readFileSync(join(root, 'src/app.html'), 'utf8');
    const preloaded = [...html.matchAll(/rel="preload"\s+href="[^"]*?(\/fonts\/[^"]+)"/g)].map((m) => m[1]);
    const declared = new Set(faces().map((f) => f.src));

    expect(preloaded.length).toBeGreaterThan(0);
    expect(preloaded.filter((path) => !declared.has(path))).toEqual([]);
  });
});
