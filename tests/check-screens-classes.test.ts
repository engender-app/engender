/* The screens.css single-consumer ratchet (phase 5 audit ticket 16), which
   caught it growing back to a dumping ground once already: a class only
   one screen reads belongs in that screen's own <style> block, where an
   unused rule is a compiler warning rather than silent dead text. */
import { describe, expect, it } from 'vitest';
import { classesIn, classProblems, classTokensIn, consumerCounts } from '../scripts/check-screens-classes.mjs';

describe('classesIn', () => {
  it('reads every class named in a selector prelude', () => {
    const css = `.foo { color: red; } .bar, .baz { color: blue; } .foo.qux { color: green; }`;
    expect(classesIn(css)).toEqual(new Set(['foo', 'bar', 'baz', 'qux']));
  });

  it('ignores class names mentioned only inside a comment', () => {
    const css = `/* .ghost used to live here */ .real { color: red; }`;
    expect(classesIn(css)).toEqual(new Set(['real']));
  });
});

describe('classTokensIn', () => {
  it('reads every token out of a class= attribute', () => {
    expect(classTokensIn('<div class="foo bar">')).toEqual(new Set(['foo', 'bar']));
  });

  it('reads a class: directive', () => {
    expect(classTokensIn('<div class:is-active={cond}>')).toEqual(new Set(['is-active']));
  });

  it('does not treat a hyphenated class as a substring of a longer one', () => {
    /* The trap a \b regex falls into: "kit-heading" is not the same class
       as "kit-heading-action", even though \b treats the hyphen as a
       delimiter and would match the first as a substring of the second. */
    const tokens = classTokensIn('<a class="kit-heading-action">');
    expect(tokens.has('kit-heading-action')).toBe(true);
    expect(tokens.has('kit-heading')).toBe(false);
  });

  it('does not match a bare English word that is not inside a class attribute', () => {
    // screens.css class names are often ordinary words ("home", "setup")
    // that appear constantly in prose and in unrelated script identifiers.
    const tokens = classTokensIn(`{ key: 'home', mode: 'setup' }`);
    expect(tokens.has('home')).toBe(false);
    expect(tokens.has('setup')).toBe(false);
  });
});

describe('consumerCounts', () => {
  it('counts how many files carry each class', () => {
    const counts = consumerCounts(new Set(['foo', 'bar', 'dead']), [
      { path: 'a.svelte', tokens: new Set(['foo']) },
      { path: 'b.svelte', tokens: new Set(['foo', 'bar']) }
    ]);
    expect(counts.get('foo')).toEqual(['a.svelte', 'b.svelte']);
    expect(counts.get('bar')).toEqual(['b.svelte']);
    expect(counts.get('dead')).toEqual([]);
  });
});

describe('classProblems', () => {
  it('passes a class with more than one consumer', () => {
    const counts = new Map([['shared', ['a.svelte', 'b.svelte']]]);
    expect(classProblems(counts, new Set())).toEqual([]);
  });

  it('fails a class with no consumer left anywhere', () => {
    const counts = new Map([['dead', []]]);
    const problems = classProblems(counts, new Set());
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('.dead');
    expect(problems[0]).toContain('no consumer');
  });

  it('fails a new single-consumer class not already in the baseline', () => {
    const counts = new Map([['fresh', ['owner.svelte']]]);
    const problems = classProblems(counts, new Set());
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('.fresh');
    expect(problems[0]).toContain('owner.svelte');
  });

  it('passes a single-consumer class already recorded in the baseline', () => {
    const counts = new Map([['long-tail', ['owner.svelte']]]);
    expect(classProblems(counts, new Set(['long-tail']))).toEqual([]);
  });

  it('reports every problem class rather than stopping at the first', () => {
    const counts = new Map([
      ['dead-one', []],
      ['fresh-one', ['owner.svelte']],
      ['fine', ['a.svelte', 'b.svelte']]
    ]);
    expect(classProblems(counts, new Set())).toHaveLength(2);
  });

  it('skips a class in the sheet\'s own SHARED set, zero consumers or one', () => {
    const counts = new Map([
      ['icon', []],
      ['kit-tile-act', ['owner.svelte']]
    ]);
    const shared = new Set(['icon', 'kit-tile-act']);
    expect(classProblems(counts, new Set(), shared)).toEqual([]);
  });
});
