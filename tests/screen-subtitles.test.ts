/* A screen's subtitle is a sentence, not a row's fragment (phase 11 ticket
   20, audit item 14).

   The two are written differently on purpose. A row subtitle continues its
   title - "Security · passphrase, PIN and biometrics" - and a lowercase
   fragment is right there. A screen subtitle sits alone under a 48px title
   with nothing before it, so the same fragment reads as a sentence somebody
   forgot to finish: the Look back door carried "put two ranges side by
   side" and "track one spot's dysphoria and euphoria over time" under
   Compare and Body map until the audit named them.

   A grep rather than a render, the same call `change-lines.test.ts` makes:
   the rule lives in a catalogue and has no interface to call, and the
   failure mode is somebody reusing a row's string on a header later. Both
   catalogues, since a sentence fixed in one language only is how the two
   screens stop agreeing. */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { globSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('..', import.meta.url));
const catalogue = (locale: string) =>
  JSON.parse(readFileSync(`${root}messages/${locale}.json`, 'utf8')) as Record<string, string>;

/** Every message key a `<ScreenHeader>` passes as its `subtitle`. */
function subtitleKeys(): { file: string; key: string }[] {
  const found: { file: string; key: string }[] = [];
  for (const file of globSync('src/**/*.svelte', { cwd: root })) {
    const source = readFileSync(root + file, 'utf8');
    for (const header of source.matchAll(/<ScreenHeader[\s\S]{0,600}?\/?>/g)) {
      const key = /subtitle=\{m\.([a-zA-Z0-9_]+)\(/.exec(header[0])?.[1];
      if (key) found.push({ file, key });
    }
  }
  return found;
}

describe('what a screen puts under its title', () => {
  const keys = subtitleKeys();

  it('finds the headers at all, so a rename cannot quietly empty this test', () => {
    expect(keys.length).toBeGreaterThan(20);
  });

  it('is a sentence in both catalogues: a capital at the front and a stop at the end', () => {
    for (const { file, key } of keys) {
      for (const locale of ['en', 'pl']) {
        const line = catalogue(locale)[key];
        expect(line, `${key} (${locale}) is missing`).toBeTruthy();
        expect(line[0], `${file}: ${key} (${locale}) opens lowercase, like a row's fragment`).toBe(
          line[0].toUpperCase()
        );
        expect(line.trimEnd().at(-1), `${file}: ${key} (${locale}) does not finish its sentence`).toMatch(
          /[.!?]/
        );
      }
    }
  });
});
