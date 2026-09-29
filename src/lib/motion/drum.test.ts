import { afterEach, describe, expect, it } from 'vitest';
import { drumIn, drumOut } from './drum';

/* The same stub reveal.test.ts uses: the duration comes off the token layer
   through getComputedStyle, and the reduced-motion signal off
   documentElement.dataset. */
function stubDocument(reduced = false) {
  const g = globalThis as Record<string, unknown>;
  g.document = { documentElement: { dataset: reduced ? { a11yMotion: 'reduce' } : {} } };
  g.getComputedStyle = () => ({
    getPropertyValue: (name: string) => ({ '--dur-med': '240ms' })[name] ?? ''
  });
}

afterEach(() => {
  const g = globalThis as Record<string, unknown>;
  delete g.document;
  delete g.getComputedStyle;
});

const node = {} as Element;
const frame = (css: (t: number, u: number) => string, t: number) => css(t, 1 - t);

describe('tier 3, a glyph passing through a block', () => {
  it('rises in from under the bottom edge and rests in place', () => {
    stubDocument();
    const { css, duration } = drumIn(node);
    expect(duration).toBe(240);
    expect(frame(css!, 0)).toBe('translate: 0 100%');
    expect(frame(css!, 1)).toBe('translate: 0 0%');
  });

  it('rises out through the top edge, the way the new face came', () => {
    stubDocument();
    const { css } = drumOut(node);
    /* Svelte drives an outro from t=1 down to 0. */
    expect(frame(css!, 1)).toBe('translate: 0 0%');
    expect(frame(css!, 0)).toBe('translate: 0 -100%');
  });

  it('is a transform and nothing else, so the block does the clipping', () => {
    stubDocument();
    expect(frame(drumIn(node).css!, 0.4)).toMatch(/^translate: 0 -?[\d.]+%$/);
    expect(frame(drumOut(node).css!, 0.4)).toMatch(/^translate: 0 -?[\d.]+%$/);
  });

  it('steps in fractions of a percent, without changing a round frame', () => {
    stubDocument();
    expect(frame(drumIn(node).css!, 0.5)).toMatch(/translate: 0 \d+(\.\d{1,2})?%/);
    expect(frame(drumIn(node).css!, 0)).not.toContain('.00');
  });

  /* A stepper's numeral goes both ways (ticket 281's year): stepping back,
     the new face drops in from above and the old one falls out underneath,
     so the drum turns the way the value went. */
  it('turns the other way when the value went down', () => {
    stubDocument();
    expect(frame(drumIn(node, { dir: -1 }).css!, 0)).toBe('translate: 0 -100%');
    const { css } = drumOut(node, { dir: -1 });
    expect(frame(css!, 0)).toBe('translate: 0 100%');
  });

  /* The reduced-motion contract: substitute, never delete. The face does
     not travel, but it still changes by a fade rather than a cut, so the
     change reads as a change (DIRECTION.md rule 10). */
  it('fades rather than travels under reduced motion', () => {
    stubDocument(true);
    const { css, duration } = drumIn(node);
    expect(duration).toBeGreaterThan(0);
    expect(frame(css!, 0.5)).toBe('opacity: 0.5');
    expect(frame(drumOut(node).css!, 0.5)).toBe('opacity: 0.5');
  });
});
