/* Reads the built shell because a missing build-time hold hook would otherwise
   leave the app working while its module hints compete with first-paint CSS.
   Chunk grouping changes the number of hints; the selected locale's emitted
   graph, and when those exact URLs become live, are the contract. */
import { existsSync, readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { expect, test } from 'vitest';

const DOCUMENT = 'build/index.html';
const LOCALES = ['en', 'pl'] as const;
type Locale = typeof LOCALES[number];

function built(): string {
  if (!existsSync(DOCUMENT)) throw new Error(`No ${DOCUMENT}. Run npm run build first.`);
  return readFileSync(DOCUMENT, 'utf8');
}

function expectedHints(locale: Locale): string[] {
  const html = built();
  // The locale build records each graph before composing the selector script.
  // Async scripts (the demo worker prewarm) load separately, without a hint.
  const scripts = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map((match) => match[1]);
  const { graph } = JSON.parse(readFileSync('.svelte-kit/locale-graphs.json', 'utf8')) as {
    graph: Record<Locale, string[]>;
  };
  const hints = graph[locale].filter((url) => url.endsWith('.js') && !scripts.includes(url)).sort();
  expect(hints.filter((url) => /\/entry\/(start|app)\./.test(url))).toHaveLength(2);
  expect(hints.some((url) => /\/nodes\/0\./.test(url))).toBe(true);
  for (const url of hints) expect(existsSync(`build${url}`), url).toBe(true);
  return hints;
}

for (const locale of LOCALES) {
  test(`${locale}: the built document holds every emitted startup module hint`, () => {
    expect(built().match(/rel="modulepreload"/g) ?? []).toHaveLength(0);
    const { selectedLocale, hints } = runRelease('h2', locale);
    expect(selectedLocale).toBe(locale);
    expect(hints).toEqual(expectedHints(locale));
    expect(new Set(hints).size).toBe(hints.length);
  });
}

test('the stylesheets a paint waits for are still ordinary links', () => {
  expect((built().match(/<link[^>]*rel="stylesheet"/g) ?? []).length).toBeGreaterThan(0);
});

/* Runs the document's own script through parser insertion, DOMContentLoaded,
   the first frame, and the task after it. Keeps URLs so a partial release or
   a release of the wrong locale cannot pass by matching a count. */
function runRelease(protocol: string, locale: Locale) {
  const html = built();
  const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)]
    .map((match) => match[1])
    .find((body) => body.includes('x-modulepreload'));
  if (!script) throw new Error('no inline script in the built document mentions x-modulepreload');

  const linksIn = (markup: string) => [...markup.matchAll(/<link\b[^>]*>/g)].flatMap(([tag]) => {
    const rel = tag.match(/\brel="([^"]+)"/)?.[1];
    const href = tag.match(/\bhref="([^"]+)"/)?.[1];
    return href && (rel === 'x-modulepreload' || rel === 'modulepreload') ? [{ rel, href }] : [];
  });
  const held: Array<{ rel: string; href: string }> = [];
  const heard: Record<string, Array<() => void>> = {};
  const observers: Array<() => void> = [];
  const frames: Array<() => void> = [];
  const tasks: Array<() => void> = [];
  const root = { dataset: {}, lang: 'en' };
  runInNewContext(script, {
    JSON,
    localStorage: { getItem: () => locale, setItem: () => {} },
    matchMedia: () => ({ matches: false }),
    navigator: { language: locale, languages: [locale] },
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
      documentElement: root,
      write: (markup: string) => held.push(...linksIn(markup)),
      querySelector: () => ({ href: '' }),
      querySelectorAll: (selector: string) =>
        selector === 'link[rel="x-modulepreload"]' ? held.filter((link) => link.rel === 'x-modulepreload') : []
    },
    addEventListener: (type: string, listener: () => void) => void (heard[type] ??= []).push(listener),
    requestAnimationFrame: (callback: () => void) => void frames.push(callback),
    setTimeout: (callback: () => void) => void tasks.push(callback)
  });

  const live = () => held.filter((link) => link.rel === 'modulepreload').map((link) => link.href).sort();
  // Static head links follow the script; locale-selected links use document.write.
  held.push(...linksIn(html.slice(0, html.indexOf('</head>'))));
  for (const notify of [...observers]) notify();
  const hints = held.map((link) => link.href).sort();
  const parsed = live();
  for (const listener of heard.DOMContentLoaded ?? []) listener();
  const loaded = live();
  for (const callback of frames.splice(0)) callback();
  const frame = live();
  for (const task of tasks.splice(0)) task();
  return { selectedLocale: root.lang, hints, parsed, loaded, frame, after: live() };
}

for (const locale of LOCALES) {
  test(`${locale}: multiplexed and offline hints stay held through the first frame`, () => {
    for (const protocol of ['h2', 'h3', '']) {
      const { hints, parsed, loaded, frame, after } = runRelease(protocol, locale);
      expect(hints).toEqual(expectedHints(locale));
      expect([parsed, loaded, frame]).toEqual([[], [], []]);
      expect(after).toEqual(hints);
    }
  });

  test(`${locale}: HTTP/1.x releases every hint as the parser adds it`, () => {
    for (const protocol of ['http/1.1', 'http/1.0']) {
      const { hints, parsed, loaded, frame, after } = runRelease(protocol, locale);
      expect(hints).toEqual(expectedHints(locale));
      expect([parsed, loaded, frame, after]).toEqual([hints, hints, hints, hints]);
    }
  });
}
