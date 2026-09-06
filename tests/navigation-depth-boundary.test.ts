import { globSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/* CARPET-05. The app counts how deep it is in its own history, and every
   back control - the arrow in a screen header, Android's gesture - decides
   on that one number. A navigation that replaces the current entry instead
   of pushing one must not raise it, and SvelteKit does not say which kind
   it was: `afterNavigate` reports type `goto` either way. So the app says
   it, by going through `replaceRoute`, and this is the grep that holds it
   to that. Miss one and the screen it lands on believes there is a screen
   behind it that the browser has no entry for, so back walks out of the
   app instead of taking the screen's own fallback.

   `history.replaceState` and `$app/navigation`'s `replaceState` are a
   different thing and not matched here: they rewrite the current entry
   without navigating, so no count moves and nothing has to be told. */

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path: string) => readFileSync(root + path, 'utf8');

/* The module the mark lives in, and the test that drives it - both name the
   option because that is the thing they are about. */
const OWNS_IT = new Set(['src/lib/navigation/smart-back.ts', 'src/lib/navigation/smart-back.test.ts']);

const sources = globSync('src/**/*.{ts,svelte}', { cwd: root });

describe('replacements go through replaceRoute', () => {
  it('finds no navigation that replaces an entry behind the count\'s back', () => {
    const offenders = sources.filter((file) => !OWNS_IT.has(file) && /replaceState:\s*true/.test(read(file)));
    expect(offenders).toEqual([]);
  });

  it('is looking at source that could break the rule', () => {
    /* The negative above passes on an empty file list just as happily as on
       a clean tree, and a glob that stops matching is exactly how a grep
       test goes quietly false-green. */
    expect(sources.length).toBeGreaterThan(100);
    expect(sources).toContain('src/routes/wrapped/[cadence]/+page.svelte');
  });

  it('keeps the mark and the option in the same module', () => {
    /* `replaceRoute` is only worth anything if it is the thing that sets the
       flag `recordNavigation` reads. Split across two modules the grep above
       would still pass while the count went back to guessing. */
    const module = read('src/lib/navigation/smart-back.ts');
    expect(module).toMatch(/export function replaceRoute/);
    expect(module).toMatch(/replaceState:\s*true/);
  });
});
