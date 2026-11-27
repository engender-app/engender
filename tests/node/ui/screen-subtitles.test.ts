/* Check that screen subtitles stand alone as sentences in both catalogues.
   Row subtitles can be fragments because they follow a title. Checking the
   strings catches reuse of a row fragment in a screen header. */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { globSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../../..', import.meta.url));
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

  /* 9 since the copy sweep cut five more header
     taglines that only restated their titles, 14 after the subtext audit
     (2026-11-05) before it; the floor guards the grep, not a count of
     subtitles a screen ought to have. */
  it('finds the headers at all, so a rename cannot quietly empty this test', () => {
    expect(keys.length).toBeGreaterThan(8);
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
