/* A missing favicon can leave the old flag visible in disguise.
   Check every icon in the document-chrome fixture ships in the build
   and verify the disguised glyph. The adapters' own fixture tests
   cover name selection and the walkthrough drives the tab swap. */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import fixture from '../../../src/lib/data/prefs/fixtures/document-chrome.json';
import type { ChromeCase } from '../../../src/lib/data/prefs/fixtures/documentChromeCase.ts';

const root = new URL('../../../', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), 'utf8');
const exists = (path: string) => existsSync(fileURLToPath(new URL(path, root)));

const disguised = read('static/favicon-notes.svg');

describe('the tab icon', () => {
  it('ships every icon and manifest the chrome rule can ask for', () => {
    const names = new Set(
      (fixture as ChromeCase[]).flatMap((testCase) => [testCase.expected.icon, testCase.expected.manifest])
    );
    /* Both faces, or the fixture has stopped covering the disguise. The undisguised one is
       per-palette, so the fixture has to carry at least one flag as well as the neutral
       face. */
    expect([...names].some((name) => /^favicon-(?!notes)\w+\.svg$/.test(name))).toBe(true);
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
