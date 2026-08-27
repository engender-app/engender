/* The tab icon (F24). A favicon href that points at nothing fails silently -
   the browser simply keeps whatever icon the tab already had, which in the
   disguise case is the flag the toggle promised to take away. The walkthrough
   drives the swap in a real tab; these are the two things it cannot see from
   there - that every name the chrome rule can produce is a file the build
   ships, and that the disguised one still draws what Settings shows people
   it will draw.

   Which names those are is no longer read off the two source files with a
   regex. That check only ever asserted that app.html and +layout.svelte
   both mention both filenames, which is true of two files that disagree
   about when to use which; the fixture the two adapters are driven against
   is what says that now (prefs/fixtures/document-chrome.json). This file
   asks the remaining question, which is whether the files exist.

   A file on disk and the glyph inside it: greps and byte reads, with no
   rule to call (ticket 08). Which name the chrome rule produces is
   documentChrome's own test. */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import fixture from '../src/lib/data/prefs/fixtures/document-chrome.json';
import type { ChromeCase } from '../src/lib/data/prefs/fixtures/documentChromeCase.ts';

const root = new URL('../', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), 'utf8');
const exists = (path: string) => existsSync(fileURLToPath(new URL(path, root)));

const disguised = read('static/favicon-notes.svg');

describe('the tab icon', () => {
  it('ships every icon and manifest the chrome rule can ask for', () => {
    const names = new Set(
      (fixture as ChromeCase[]).flatMap((testCase) => [testCase.expected.icon, testCase.expected.manifest])
    );
    /* Both faces, or the fixture has stopped covering the disguise. */
    expect(names).toContain('favicon.svg');
    expect(names).toContain('favicon-notes.svg');
    for (const name of names) expect(exists(`static/${name}`), name).toBe(true);
  });

  it('draws the disguise with the same glyph the Settings preview shows', () => {
    /* The two are separate copies on purpose - a favicon cannot import the
       icon set - so nothing but this keeps them the same book. Settings
       promises "how the tab appears", and it only does while they agree. */
    const drawn = [...disguised.matchAll(/ d="([^"]+)"/g)].map((match) => match[1]);
    expect(drawn).not.toHaveLength(0);
    const iconSet = read('src/lib/components/icons.ts');
    for (const path of drawn) expect(iconSet).toContain(path);
  });
});
