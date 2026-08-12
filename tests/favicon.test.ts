/* The tab icon (F24). A favicon href that points at nothing fails silently -
   the browser simply keeps whatever icon the tab already had, which in the
   disguise case is the flag the toggle promised to take away. The walkthrough
   drives the swap in a real tab; these are the two things it cannot see from
   there - that both names are files the build ships, and that the disguised
   one still draws what Settings shows people it will draw. */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = new URL('../', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), 'utf8');
const exists = (path: string) => existsSync(fileURLToPath(new URL(path, root)));

const disguised = read('static/favicon-notes.svg');

describe('the tab icon', () => {
  it('names one file for the app and one for the disguise, both in static/', () => {
    const names = new Set(
      [read('src/app.html'), read('src/routes/+layout.svelte')].flatMap((source) =>
        [...source.matchAll(/[\w-]*favicon[\w-]*\.svg/g)].map((match) => match[0])
      )
    );
    expect(names).toContain('favicon.svg');
    expect(names).toContain('favicon-notes.svg');
    for (const name of names) expect(exists(`static/${name}`)).toBe(true);
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
