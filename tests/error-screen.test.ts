/* The unknown-address screen (phase 15 last-audit UI ticket 23, U35).

   A source scan, as for the other screens: the node tier cannot mount a
   `.svelte` file (ADR-0016). It is not on feature-screens.test.ts's list on
   purpose - that file reads `src/routes/<route>/+page.svelte`, and this is a
   `+error.svelte` with no journal read, so its loading-state and `Notice`
   assertions have nothing to hold. What matters about this one is below. */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (p: string) => readFileSync(`${root}${p}`, 'utf8');
const source = read('src/routes/+error.svelte');
const markup = source
  .replace(/<script[\s\S]*?<\/script>/g, '')
  .replace(/<style[\s\S]*?<\/style>/g, '')
  .replace(/<!--[\s\S]*?-->/g, '');
const script = source.match(/<script[\s\S]*?<\/script>/)![0].replace(/\/\*[\s\S]*?\*\//g, '');

describe('+error.svelte', () => {
  it('draws the shared header, one sentence and a link to Today', () => {
    expect(markup).toContain('<ScreenHeader');
    expect(markup.match(/<p>/g)).toHaveLength(1);
    expect(markup).toMatch(/<a class="btn btn-primary" href="\/"/);
  });

  it('never shows the attempted address or the error text', () => {
    for (const leak of ['page.url', 'page.error', 'pathname', 'page.params', 'page.route', 'location', 'error.message']) {
      expect(markup + script, leak).not.toContain(leak);
    }
  });

  it('has no transform or animation of its own and no card markup', () => {
    expect(markup + script).not.toMatch(/<style|transform|animation|transition/);
    expect(markup).not.toMatch(/class="[^"]*\b(card|list-row)\b/);
  });

  it('has its words in both catalogues, with no key left in English only', () => {
    const keys = [...source.matchAll(/m\.(error_screen_\w+)\(/g)].map((x) => x[1]);
    expect(keys.length).toBe(5);
    for (const lang of ['en', 'pl']) {
      const catalogue = JSON.parse(read(`messages/${lang}.json`));
      for (const key of keys) expect(catalogue[key], `${lang} ${key}`).toBeTruthy();
    }
  });
});
