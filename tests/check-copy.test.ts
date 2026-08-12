/* The two copy checks CI runs (phase 2 ticket 06, wiring the check ticket 19
   then relies on): the two catalogues have to hold the same keys, and no
   screen may grow new user-facing text that never reaches them.

   A missing key that source code actually calls is already a type error -
   paraglide generates one function per key, so `m.nothing_like_this()` fails
   `npm run check`. What that cannot see is a key present in English and
   absent in Polish, since the runtime falls back to the base locale and
   prints English at a Polish reader. Hence the parity half. */
import { describe, expect, it } from 'vitest';
import { catalogueProblems, findLiterals, ratchetProblems } from '../scripts/check-copy.mjs';

describe('catalogueProblems', () => {
  it('passes two catalogues holding the same keys', () => {
    expect(catalogueProblems({ $schema: 'x', hello: 'Hello' }, { $schema: 'x', hello: 'Dzień dobry' })).toEqual([]);
  });

  it('reports a key the Polish catalogue is missing', () => {
    const problems = catalogueProblems({ hello: 'Hello', bye: 'Bye' }, { hello: 'Dzień dobry' });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('bye');
    expect(problems[0]).toContain('pl.json');
  });

  it('reports a key only Polish has, which is a key nothing can be falling back to', () => {
    const problems = catalogueProblems({ hello: 'Hello' }, { hello: 'Dzień dobry', czesc: 'Cześć' });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('czesc');
    expect(problems[0]).toContain('en.json');
  });

  it('ignores the $schema pointer, which is not a message', () => {
    expect(catalogueProblems({ $schema: 'a' }, {})).toEqual([]);
  });
});

describe('findLiterals', () => {
  const texts = (source: string) => findLiterals(source).map((found) => found.text);

  it('finds text written straight into the markup', () => {
    expect(texts('<p>Choose a journal passphrase</p>')).toEqual(['Choose a journal passphrase']);
  });

  it('says nothing about text that came from the catalogues', () => {
    expect(texts('<p>{m.nav_settings()}</p>')).toEqual([]);
  });

  it('leaves markup that carries no words alone', () => {
    // Separators, arrows and the punctuation between two catalogue calls.
    expect(texts('<p>{m.a()} · {m.b()} — {m.c()}</p>')).toEqual([]);
  });

  it('finds an attribute a screen reader reads out', () => {
    expect(texts('<nav aria-label="Main"><a href="/">{m.home()}</a></nav>')).toEqual(['Main']);
  });

  it('leaves attributes nobody reads alone', () => {
    expect(texts('<div class="screen" data-testid="entry" style="color:red"></div>')).toEqual([]);
  });

  it('does not read the script block, where a string may be anything', () => {
    expect(texts('<script lang="ts">\n  const label = "not markup";\n</script>\n<p>{label}</p>')).toEqual([]);
  });

  it('does not read a markup comment', () => {
    expect(texts('<!-- No name in the greeting on purpose -->\n<p>{m.hello()}</p>')).toEqual([]);
  });

  it('looks inside blocks, where the copy that gets forgotten lives', () => {
    expect(texts('{#if broken}<p>Something went wrong</p>{/if}')).toEqual(['Something went wrong']);
  });

  it('reports where in the file each one is, so the count can be acted on', () => {
    expect(findLiterals('<p>Hello</p>')[0].line).toBe(1);
  });
});

describe('ratchetProblems', () => {
  it('passes a file that still has exactly the literals it had', () => {
    expect(ratchetProblems({ 'a.svelte': 3 }, { 'a.svelte': 3 })).toEqual([]);
  });

  it('rejects a file that grew new ones', () => {
    const problems = ratchetProblems({ 'a.svelte': 4 }, { 'a.svelte': 3 });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('a.svelte');
    expect(problems[0]).toContain('4');
  });

  it('rejects a screen that starts out with text outside the catalogues', () => {
    const problems = ratchetProblems({ 'new.svelte': 2 }, {});
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('new.svelte');
  });

  it('rejects a stale baseline after copy moved into the catalogues', () => {
    /* Left alone, an unlowered number is room for the same screen to regress
       back to it in silence. Lowering it is the visible half of the work
       tickets 19 and 23 do. */
    const problems = ratchetProblems({ 'a.svelte': 1 }, { 'a.svelte': 3 });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/1/);
  });

  it('rejects a baseline entry for a file with nothing left to fix', () => {
    expect(ratchetProblems({}, { 'a.svelte': 3 })).toHaveLength(1);
  });
});
