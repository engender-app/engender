/* The tab icon (F24). A favicon href that points at nothing fails silently -
   the browser simply keeps whatever icon the tab already had, which in the
   disguise case is the flag the toggle promised to take away. The walkthrough
   checks the swap happens in a real tab; this checks the two names it swaps
   between are files the build actually ships. */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = new URL('../', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), 'utf8');
const exists = (path: string) => existsSync(fileURLToPath(new URL(path, root)));

describe('the tab icon', () => {
  it('is swapped for a neutral one, and both files are in static/', () => {
    const names = new Set(
      [read('src/app.html'), read('src/routes/+layout.svelte')].flatMap((source) =>
        [...source.matchAll(/[\w-]*favicon[\w-]*\.svg/g)].map((match) => match[0])
      )
    );
    expect(names).toContain('favicon.svg');
    expect(names).toContain('favicon-notes.svg');
    for (const name of names) expect(exists(`static/${name}`)).toBe(true);
  });
});
