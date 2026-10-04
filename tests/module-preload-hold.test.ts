/* The built document holds its module hints back (phase 14 pre-release
   ticket 13), and gives them back.

   The first paint of a first visit depends on it: the document names about a
   hundred modules and six stylesheets, the browser fetches them all at once
   and shares the connection evenly, and the stylesheets a paint waits for
   arrived at 2.5 s behind modules nothing was waiting for. With the hints
   held until after the first frame, first paint was 0.9 s. Nothing about the
   build fails if the hook that does it (src/hooks.server.ts) stops running,
   or if SvelteKit moves where the fallback page is rendered, so this reads
   the built document and fails instead.

   It reads `build/`, so it needs a build, like csp.test.ts. */
import { existsSync, readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { expect, test } from 'vitest';

const DOCUMENT = 'build/index.html';

function built(): string {
  if (!existsSync(DOCUMENT)) throw new Error(`No ${DOCUMENT}. Run npm run build first.`);
  return readFileSync(DOCUMENT, 'utf8');
}

test('the built document has no live modulepreload link, and names its modules as held ones', () => {
  const html = built();
  expect(html.match(/rel="modulepreload"/g) ?? []).toHaveLength(0);
  expect((html.match(/rel="x-modulepreload"/g) ?? []).length).toBeGreaterThan(50);
});

test('the stylesheets a paint waits for are still ordinary links', () => {
  expect((built().match(/<link[^>]*rel="stylesheet"/g) ?? []).length).toBeGreaterThan(0);
});

test("the document's own script gives every held link back after DOMContentLoaded", () => {
  const html = built();
  const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)]
    .map((match) => match[1])
    .find((body) => body.includes('x-modulepreload'));
  if (!script) throw new Error('no inline script in the built document mentions x-modulepreload');

  const held = [...html.matchAll(/<link[^>]*rel="x-modulepreload"[^>]*>/g)].map(() => ({ rel: 'x-modulepreload' }));
  const heard: Record<string, Array<() => void>> = {};
  runInNewContext(script, {
    JSON,
    localStorage: { getItem: () => null },
    matchMedia: () => ({ matches: false }),
    navigator: { language: 'en' },
    document: {
      documentElement: { dataset: {} },
      querySelector: () => ({ href: '' }),
      querySelectorAll: (selector: string) => (selector === 'link[rel="x-modulepreload"]' ? held : [])
    },
    addEventListener: (type: string, listener: () => void) => void (heard[type] ??= []).push(listener),
    requestAnimationFrame: (callback: () => void) => callback(),
    setTimeout: (callback: () => void) => callback()
  });

  expect(held.every((link) => link.rel === 'x-modulepreload')).toBe(true);
  for (const listener of heard.DOMContentLoaded ?? []) listener();
  expect(held.length).toBeGreaterThan(50);
  expect(held.every((link) => link.rel === 'modulepreload')).toBe(true);
});
