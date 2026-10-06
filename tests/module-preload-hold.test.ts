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

/* Runs the document's own inline script in a fake window that serves the
   page over `protocol`, and returns what happened to the held links at each
   step a browser takes: the parser adding them, DOMContentLoaded, the next
   frame, the task after it. */
function runRelease(protocol: string) {
  const html = built();
  const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)]
    .map((match) => match[1])
    .find((body) => body.includes('x-modulepreload'));
  if (!script) throw new Error('no inline script in the built document mentions x-modulepreload');

  const count = [...html.matchAll(/<link[^>]*rel="x-modulepreload"[^>]*>/g)].length;
  const held: Array<{ rel: string }> = [];
  const heard: Record<string, Array<() => void>> = {};
  const observers: Array<() => void> = [];
  const frames: Array<() => void> = [];
  const tasks: Array<() => void> = [];
  runInNewContext(script, {
    JSON,
    localStorage: { getItem: () => null },
    matchMedia: () => ({ matches: false }),
    navigator: { language: 'en' },
    performance: { getEntriesByType: (type: string) => (type === 'navigation' ? [{ nextHopProtocol: protocol }] : []) },
    MutationObserver: class {
      constructor(private callback: () => void) {}
      observe() {
        observers.push(() => this.callback());
      }
      disconnect() {
        observers.length = 0;
      }
    },
    document: {
      documentElement: { dataset: {} },
      querySelector: () => ({ href: '' }),
      querySelectorAll: (selector: string) =>
        selector === 'link[rel="x-modulepreload"]' ? held.filter((link) => link.rel === 'x-modulepreload') : []
    },
    addEventListener: (type: string, listener: () => void) => void (heard[type] ??= []).push(listener),
    requestAnimationFrame: (callback: () => void) => void frames.push(callback),
    setTimeout: (callback: () => void) => void tasks.push(callback)
  });

  const live = () => held.filter((link) => link.rel === 'modulepreload').length;
  // The parser reaches the links in <head>, after the script has run.
  for (let k = 0; k < count; k++) held.push({ rel: 'x-modulepreload' });
  for (const notify of [...observers]) notify();
  const parsed = live();
  for (const listener of heard.DOMContentLoaded ?? []) listener();
  const loaded = live();
  for (const frame of frames.splice(0)) frame();
  for (const task of tasks.splice(0)) task();
  return { count, parsed, loaded, after: live() };
}

test('over HTTP/2 and HTTP/3 the hints stay held until the first frame has had its turn', () => {
  for (const protocol of ['h2', 'h3']) {
    const { count, parsed, loaded, after } = runRelease(protocol);
    expect(count).toBeGreaterThan(50);
    expect([parsed, loaded, after]).toEqual([0, 0, count]);
  }
});

/* After-release ticket 31 (audit PERF-03): six connections, not one, so
   the stylesheets were never the ones waiting, and holding the hints only
   queued ninety-eight modules behind the first frame. LCP was 7125-7134 ms
   held against 6842-6861 ms given back at once. */
test('over HTTP/1.1 each hint is given back as the parser adds it, before DOMContentLoaded', () => {
  const { count, parsed, after } = runRelease('http/1.1');
  expect(count).toBeGreaterThan(50);
  expect(parsed).toBe(count);
  expect(after).toBe(count);
});
