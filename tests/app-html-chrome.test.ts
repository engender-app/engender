/* The pre-paint half of the document chrome (ADR-0009): the inline script
   at the top of src/app.html, run here against the same cases
   documentChrome.test.ts runs the layout's rule against.

   The script is executed rather than grepped. It cannot be imported - it is
   inline text in an HTML file, deliberately dependency-free because it runs
   before any module is parsed - so this reads it out of the document and
   runs it in a sandbox holding the smallest browser it touches: a boot
   cache, two media queries, the <html> element's own dataset and the two
   links. What the script leaves behind is the document a cold start paints
   with.

   Before this, the only thing asserting any of it was a check that both
   files mention both favicon filenames, and a grep for three dataset writes
   in the layout. Neither could tell the two adapters apart when they
   disagreed. */

import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { documentChrome } from '../src/lib/data/prefs/documentChrome.ts';
import { PREFERENCE_DEFAULTS } from '../src/lib/data/prefs/catalogue.ts';
import { BOOT_CACHE_KEY } from '../src/lib/data/prefs/boot-cache.ts';
import fixture from '../src/lib/data/prefs/fixtures/document-chrome.json';
import type { ChromeCase } from '../src/lib/data/prefs/fixtures/documentChromeCase.ts';

const source = readFileSync(new URL('../src/app.html', import.meta.url), 'utf8');

/** The one inline script in the document - the pre-paint stamp. A second
    one appearing would make this ambiguous, which is worth failing over. */
function prePaintScript(): string {
  const inline = [...source.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]);
  expect(inline).toHaveLength(1);
  return inline[0];
}

/** The attributes the parser has already applied when the script runs:
    what a first-ever visit, or a visit where the script throws, is left
    wearing. `data-mood-preset` reaches the script as `dataset.moodPreset`,
    so the seed is converted the way the DOM would. */
function documentElementDataset(): Record<string, string> {
  const tag = source.match(/<html\s([^>]*)>/);
  if (!tag) throw new Error('no <html> tag in src/app.html');
  const dataset: Record<string, string> = {};
  for (const [, name, value] of tag[1].matchAll(/data-([\w-]+)="([^"]*)"/g)) {
    dataset[name.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase())] = value;
  }
  return dataset;
}

/** The two links the script rewrites, with the hrefs the document ships. */
function documentLinks(): { icon: string; manifest: string } {
  const href = (rel: string) => {
    const link = source.match(new RegExp(`<link rel="${rel}" href="([^"]*)"`));
    if (!link) throw new Error(`no <link rel="${rel}"> in src/app.html`);
    return link[1];
  };
  return { icon: href('icon'), manifest: href('manifest') };
}

const fileName = (href: string) => href.slice(href.lastIndexOf('/') + 1);

/** Runs the pre-paint script over one boot cache and returns the eight
    stamps it leaves on the document. */
function stamp(boot: unknown, system: { prefersDark: boolean; prefersReducedMotion: boolean }) {
  const dataset = documentElementDataset();
  const links = documentLinks();
  const elements: Record<string, { href: string }> = {
    'link[rel="icon"]': { href: links.icon },
    'link[rel="manifest"]': { href: links.manifest }
  };
  runInNewContext(prePaintScript(), {
    JSON,
    localStorage: {
      /* Answered by the constant boot-cache.ts writes under, not by
         app.html's own literal: the two are the second thing that file's
         header says has to be changed together, and a script reading a key
         nothing writes finds no mirror and silently paints the defaults. */
      getItem: (key: string) => (key === BOOT_CACHE_KEY ? JSON.stringify(boot) : null)
    },
    matchMedia: (query: string) => ({
      matches: query.includes('prefers-color-scheme: dark') ? system.prefersDark : system.prefersReducedMotion
    }),
    document: {
      documentElement: { dataset },
      querySelector: (selector: string) => elements[selector] ?? null
    }
  });
  return { dataset, icon: fileName(elements['link[rel="icon"]'].href), manifest: fileName(elements['link[rel="manifest"]'].href) };
}

describe("app.html's pre-paint script against the shared fixture", () => {
  for (const testCase of fixture as ChromeCase[]) {
    it(testCase.name, () => {
      const stamped = stamp(testCase.prefs, testCase.system);
      /* Read back by the expected object's own keys, so a stamp added to
         the fixture is one this script has to start writing rather than one
         this test has to be taught about. */
      const actual = Object.fromEntries(
        Object.keys(testCase.expected).map((key) => [
          key,
          key === 'icon' || key === 'manifest' ? stamped[key] : stamped.dataset[key]
        ])
      );
      expect(actual).toEqual(testCase.expected);
    });
  }

  it('falls back to what the catalogue defaults resolve to', () => {
    /* The attributes written on <html> by hand, and the two hrefs, are what
       a first-ever visit wears - the script has no mirror to read yet and
       leaves them alone. They are only right while they say what the
       preferences they stand in for would have said. Asked on a light
       system with motion unreduced, because that is what the hand-written
       `data-theme="light"` and `data-a11y-motion="normal"` claim. */
    const links = documentLinks();
    const parsed = documentElementDataset();
    expect({
      palette: parsed.palette,
      moodPreset: parsed.moodPreset,
      theme: parsed.theme,
      a11yTextSize: parsed.a11yTextSize,
      a11yLegibility: parsed.a11yLegibility,
      a11yMotion: parsed.a11yMotion,
      icon: fileName(links.icon),
      manifest: fileName(links.manifest)
    }).toEqual(documentChrome(PREFERENCE_DEFAULTS, { prefersDark: false, prefersReducedMotion: false }));
  });

  it('leaves the document alone when there is no mirror to read', () => {
    /* A first-ever visit reaches the script too, and it must not stamp a
       palette out of an empty object - `undefined` on the element would
       drop the fallback the parser already applied. */
    const stamped = stamp({}, { prefersDark: false, prefersReducedMotion: false });
    expect(stamped.dataset.palette).toBe(documentElementDataset().palette);
    expect(stamped.dataset.moodPreset).toBe(documentElementDataset().moodPreset);
    expect(stamped.icon).toBe(fileName(documentLinks().icon));
  });
});
