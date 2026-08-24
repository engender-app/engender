import { afterEach, describe, expect, it } from 'vitest';
import type { TransitionConfig } from 'svelte/transition';

import { containerReceive, containerSend, fadeThrough, sharedAxisX, sheetRise } from './navigation';

/* The node tier has no DOM, and these read their durations and distances
   out of the token layer through $lib/motion/tokens. A stub document is
   enough for both: tokens.ts asks getComputedStyle for the number and
   documentElement.dataset for the reduced-motion signal. */
function stubDocument(vars: Record<string, string>, reduced = false) {
  const g = globalThis as Record<string, unknown>;
  g.document = { documentElement: { dataset: reduced ? { a11yMotion: 'reduce' } : {} } };
  g.getComputedStyle = () => ({ getPropertyValue: (name: string) => vars[name] ?? '' });
}

const TOKENS = {
  '--dur-med': '240ms',
  '--dur-crossfade': '120ms',
  '--motion-distance-md': '24px'
};

afterEach(() => {
  const g = globalThis as Record<string, unknown>;
  delete g.document;
  delete g.getComputedStyle;
});

const node = {} as Element;
/** The transform a primitive asks for at a point in its timeline. */
function frame(css: (t: number, u: number) => string, t: number) {
  return css(t, 1 - t);
}

describe('fade-through, between the four tabs', () => {
  it('brings the incoming screen in from 1.03 and lands it at rest', () => {
    stubDocument(TOKENS);
    const { css, duration } = fadeThrough(node, {}, { direction: 'in' });
    expect(duration).toBe(240);
    expect(frame(css!, 0)).toMatch(/scale\(1\.03\)/);
    expect(frame(css!, 0)).toMatch(/opacity: 0\b/);
    expect(frame(css!, 1)).toMatch(/scale\(1\)/);
    expect(frame(css!, 1)).toMatch(/opacity: 1\b/);
  });

  it('settles the outgoing screen to 0.97 rather than shrinking it the same way', () => {
    stubDocument(TOKENS);
    const { css } = fadeThrough(node, {}, { direction: 'out' });
    expect(frame(css!, 1)).toMatch(/scale\(1\)/);
    expect(frame(css!, 0)).toMatch(/scale\(0\.97\)/);
  });

  it('crossfades with no transform at all under reduced motion', () => {
    stubDocument(TOKENS, true);
    const { css, duration } = fadeThrough(node, {}, { direction: 'in' });
    expect(duration, 'a crossfade needs a duration the 1ms clamp cannot reach').toBe(120);
    expect(frame(css!, 0.5)).not.toContain('transform');
    expect(frame(css!, 0.5)).toMatch(/opacity: 0\.5/);
  });
});

describe('shared-axis-X, into a detail from a list', () => {
  it('enters from the far side and leaves toward the near one', () => {
    stubDocument(TOKENS);
    expect(frame(sharedAxisX(node, {}, { direction: 'in' }).css!, 0)).toMatch(/translateX\(24px\)/);
    expect(frame(sharedAxisX(node, {}, { direction: 'in' }).css!, 1)).toMatch(/translateX\(0px\)/);
    expect(frame(sharedAxisX(node, {}, { direction: 'out' }).css!, 0)).toMatch(/translateX\(-24px\)/);
  });

  it('reverses the axis on the way back', () => {
    stubDocument(TOKENS);
    expect(frame(sharedAxisX(node, { back: true }, { direction: 'in' }).css!, 0)).toMatch(/translateX\(-24px\)/);
    expect(frame(sharedAxisX(node, { back: true }, { direction: 'out' }).css!, 0)).toMatch(/translateX\(24px\)/);
  });

  it('crossfades with no transform at all under reduced motion', () => {
    stubDocument(TOKENS, true);
    const { css, duration } = sharedAxisX(node, {}, { direction: 'in' });
    expect(duration).toBe(120);
    expect(frame(css!, 0.5)).not.toContain('transform');
  });
});

describe('sheet rise', () => {
  it('rises by the sheet distance and lands at rest', () => {
    stubDocument(TOKENS);
    const { css } = sheetRise(node, {});
    expect(frame(css!, 0)).toMatch(/translateY\(24px\)/);
    expect(frame(css!, 1)).toMatch(/translateY\(0px\)/);
  });

  it('crossfades with no transform at all under reduced motion', () => {
    stubDocument(TOKENS, true);
    expect(frame(sheetRise(node, {}).css!, 0.5)).not.toContain('transform');
  });
});

describe('container transform, into the entry editor', () => {
  /* The pair is svelte/transition's crossfade, which does the FLIP between
     the two elements. What is worth asserting here is the substitution the
     reduced-motion contract asks for: no FLIP at all, because a FLIP is
     nothing but movement. */
  it('drops the FLIP for a plain crossfade under reduced motion', () => {
    stubDocument(TOKENS, true);
    for (const half of [containerSend, containerReceive]) {
      const config = half(node, { key: 'entry-1' });
      expect(typeof config, 'the reduced substitute is a plain config, not a deferred pair').not.toBe('function');
      const plain = config as TransitionConfig;
      expect(plain.duration).toBe(120);
      expect(frame(plain.css!, 0.5)).not.toContain('transform');
    }
  });

  /* svelte/transition's crossfade defers: send and receive hand back a
     thunk that runs once the counterpart has registered, which is what
     lets it measure both boxes. Reaching further than "it deferred" means
     laying out two real elements, which is the browser tier's job. */
  it('hands off to the real crossfade when motion is allowed', () => {
    stubDocument(TOKENS);
    expect(typeof containerSend(node, { key: 'entry-1' })).toBe('function');
    expect(typeof containerReceive(node, { key: 'entry-1' })).toBe('function');
  });
});
