/* The disguised identity, at both levels it can be checked at.

   Most of this file calls the rule: `tabIdentity` and `appWordmark` are
   pure, so the disguise preference decides the two
   cases below.

   The last test is a source grep, and deliberately one. What it guards is
   not behaviour but reach - that no surface anywhere in `src/` has written
   the decoy's name out for itself again - and there is no call that can
   answer "and nowhere else". A grep is the right instrument for a
   negative over a whole tree; it is the wrong one for everything above
   it, which is why the rest of this file stopped being greps. */

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { appWordmark, tabIdentity } from './identity.ts';

describe('the wordmark a surface prints', () => {
  it('is the decoy name under disguise, whatever the app is called', () => {
    expect(appWordmark(true, 'engender', 'Notes')).toBe('Notes');
    expect(appWordmark(true, 'engender', 'Notatki')).toBe('Notatki');
  });

  it('is the app name the caller was given otherwise', () => {
    /* The name is a parameter because it is a catalogue lookup and this
       tier may not import paraglide (ADR-0016). */
    expect(appWordmark(false, 'engender', 'Notatki')).toBe('engender');
  });
});

describe('what the tab says', () => {
  const chromeIcon = 'favicon-trans.svg';

  it('says the app name over the running app', () => {
    expect(tabIdentity({ disguised: false, appName: 'engender', decoyName: 'Notes', icon: chromeIcon })).toEqual({
      title: 'engender',
      icon: 'favicon-trans.svg'
    });
  });

  it('says the decoy name over the running app when disguised', () => {
    expect(
      tabIdentity({ disguised: true, appName: 'engender', decoyName: 'Notes', icon: 'favicon-notes.svg' })
    ).toEqual({
      title: 'Notes',
      icon: 'favicon-notes.svg'
    });
  });


});

describe('where the decoy name is allowed to appear', () => {
  const root = fileURLToPath(new URL('../../..', import.meta.url));

  const sources = (dir: string): string[] =>
    readdirSync(root + dir, { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory()
        ? entry.name === 'paraglide'
          ? []
          : sources(`${dir}/${entry.name}`)
        : [`${dir}/${entry.name}`]
    );

  /* Comments are stripped before the search rather than the search being
     narrowed to one quoting style: half a dozen files explain the
     disguise in prose, and a check that only caught `'Notes'` would miss
     a new surface writing "Notes" or a bare text node - which is exactly
     the surface this is here to catch. Identifiers are safe on the word boundary. */
  const withoutComments = (source: string) =>
    source
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');

  it('is supplied by catalogues after the pre-paint script', () => {
    /* ADR-0035 asks for the disguise check to live in one place, and the
       cost of a surface forgetting it is not cosmetic: it shows the real
       app name to whoever the person was hiding it from.

       `src/` only. The name is also in static/manifest-notes.webmanifest,
       which is the launcher entry rather than a surface and is held to the
       catalogue by tests/web-manifest.test.ts. */
    const naming = sources('src')
      .filter((path) => !path.endsWith('.test.ts'))
      /* Demo seed prose, not a surface: fullFixture writes journal
         content, and "Notes on trying out X" is an English sentence that
         happens to start with the word. */
      .filter((path) => path !== 'src/lib/data/demo/fullFixture.ts')
      .filter((path) => /\bNotes\b/.test(withoutComments(readFileSync(root + path, 'utf8'))));
    expect(naming).toEqual(['src/app.html']);
  });


});

describe('catalogued app names', () => {
  const root = fileURLToPath(new URL('../../../', import.meta.url));
  const files = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(entry =>
    entry.name === 'paraglide' ? [] : entry.isDirectory() ? files(`${dir}/${entry.name}`)
      : /\.(svelte|ts)$/.test(entry.name) && !entry.name.endsWith('.test.ts') ? [`${dir}/${entry.name}`] : []);
  const sources = files(`${root}src`).map(path => ({ path, text: readFileSync(path, 'utf8') }));

  for (const locale of ['en', 'pl']) {
    const catalogue = JSON.parse(readFileSync(`${root}messages/${locale}.json`, 'utf8')) as Record<string, string>;
    it(`${locale}: only the identity entry contains the literal app name`, () => {
      expect(Object.keys(catalogue).filter(key => /engender/i.test(catalogue[key]))).toEqual(['app_name']);
    });

    it(`${locale}: every named sentence receives the wordmark at its call site`, () => {
      const keys = Object.keys(catalogue).filter(key => catalogue[key].includes('{appName}'));
      expect(keys.length).toBeGreaterThan(0);
      for (const key of keys) {
        const uses = sources.flatMap(({ path, text }) => [...text.matchAll(new RegExp(`m\\.${key}\\b`, 'g'))]
          .map(match => ({ path, call: text.slice(match.index) })));
        expect(uses.length, key).toBeGreaterThan(0);
        for (const { path, call } of uses) {
          expect(call, `${path}: ${key}`).toMatch(/^m\.\w+\(\{\s*appName:\s*(?:appWordmark\(prefs\.disguise, m\.app_name\(\), m\.disguise_name\(\)\)|m\.app_name\(\))/);
        }
      }
    });
  }
});
