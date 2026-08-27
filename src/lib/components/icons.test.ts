/* icon() builds an SVG string that Icon.svelte renders through {@html}, the
   only {@html} in the app (phase 5 ticket 03). Every call site passes literals
   today and `name` is looked up in a fixed map, so nothing here was injectable
   - but it was one dynamic caller away from being so, and a sink that is only
   safe because of who calls it needs a test rather than a habit.

   The geometry of the marks themselves is tests/icon-geometry.test.ts. */
import { describe, expect, test } from 'vitest';
import { icon } from './icons';

/** Anything that would end the attribute, the tag or the element. */
const BREAKOUT = ['"', "'", '<', '>', '&'];

describe('icon() cannot emit markup from its arguments', () => {
  test('a class that carries a quote and a tag emits neither', () => {
    const svg = icon('home', 24, '"><script>alert(1)</script><b class="');
    expect(svg).not.toContain('<script');
    expect(svg).not.toContain('<b');
    // One element, and its attributes are the ones this function wrote.
    expect([...svg.matchAll(/<svg/g)]).toHaveLength(1);
    expect(svg).toContain('class="icon scriptalert1scriptb class"');
  });

  test('a size that is not a number falls back to 24', () => {
    const svg = icon('home', '24" onload="alert(1)' as unknown as number);
    expect(svg).toContain('width="24"');
    expect(svg).toContain('height="24"');
    expect(svg).not.toContain('onload');
  });

  test.each([0, -8, Number.NaN, Number.POSITIVE_INFINITY])('a size of %s falls back to 24', (size) => {
    expect(icon('home', size)).toContain('width="24"');
  });

  test('arguments carrying every breakout character render as if they were clean', () => {
    const dirty = icon('home', `24${BREAKOUT.join('')}` as unknown as number, `a${BREAKOUT.join('')}b`);
    expect(dirty).toBe(icon('home', 24, 'ab'));
  });

  test('an unknown name still falls back to the info glyph', () => {
    expect(icon('nope')).toContain('cx="12"');
  });
});

describe('icon() keeps doing its job', () => {
  test('the sizes and classes real call sites pass come through unchanged', () => {
    const svg = icon('star', 14, 'is-starred');
    expect(svg).toContain('class="icon is-starred"');
    expect(svg).toContain('width="14"');
    expect(svg).toContain('height="14"');
  });

  test('two class tokens stay two class tokens', () => {
    expect(icon('star', 20, 'is-starred is-large')).toContain('class="icon is-starred is-large"');
  });
});
