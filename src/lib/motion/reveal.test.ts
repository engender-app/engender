import { afterEach, describe, expect, it } from 'vitest';

import { wipe } from './reveal';

/* Same stub the tier-2 tests use: reveal.ts reads its duration and its easing
   out of the token layer through $lib/motion/tokens, which asks
   getComputedStyle for the number and documentElement.dataset for the
   reduced-motion signal. CSS is stubbed too, because this primitive also asks
   whether the runtime has clip-path at all. */
function stubDocument(reduced = false, clipPath = true) {
  const g = globalThis as Record<string, unknown>;
  g.document = { documentElement: { dataset: reduced ? { a11yMotion: 'reduce' } : {} } };
  g.getComputedStyle = () => ({
    getPropertyValue: (name: string) => ({ '--dur-slow': '380ms', '--dur-crossfade': '120ms' })[name] ?? ''
  });
  g.CSS = { supports: () => clipPath };
}

afterEach(() => {
  const g = globalThis as Record<string, unknown>;
  delete g.document;
  delete g.getComputedStyle;
  delete g.CSS;
});

const node = {} as Element;
const frame = (css: (t: number, u: number) => string, t: number) => css(t, 1 - t);

describe('tier 3, the wipe', () => {
  it('uncovers from the left, so content arrives the way it is read', () => {
    stubDocument();
    const { css, duration } = wipe(node);
    expect(duration).toBe(380);
    expect(frame(css!, 0)).toBe('clip-path: inset(0 100% 0 0)');
    expect(frame(css!, 1)).toBe('clip-path: inset(0 0 0 0)');
  });

  /* The same rule tests/motion-system.test.ts holds every CSS animation to,
     restated for a transition the stylesheet cannot reach: an animation that
     ends anywhere but its element's resting state strands it there. */
  it('ends uncovered, which is where the element rests', () => {
    stubDocument();
    expect(frame(wipe(node).css!, 1)).toBe('clip-path: inset(0 0 0 0)');
  });

  it('runs on the tier-3 duration rather than a literal', () => {
    stubDocument();
    expect(wipe(node).duration).toBe(380);
  });

  /* Tier 3's reduced-motion substitute is an instant cut, not tier 2's
     crossfade: a change within a screen has no journey to explain, so there
     is nothing for a fade to stand in for. */
  it('cuts instantly under reduced motion, and clips nothing on the way', () => {
    stubDocument(true);
    const config = wipe(node);
    expect(config.duration).toBe(0);
    expect(config.css, 'a cut applies no geometry at all').toBeUndefined();
  });

  /* The support fallback is a designed state rather than an unstyled one:
     where clip-path is missing the content fades in over the same duration,
     which is a weaker version of the same idea and not a broken one. */
  it('fades over the same duration where clip-path is missing', () => {
    stubDocument(false, false);
    const { css, duration } = wipe(node);
    expect(duration).toBe(380);
    expect(frame(css!, 0)).toBe('opacity: 0');
    expect(frame(css!, 1)).toBe('opacity: 1');
    expect(frame(css!, 0.5)).not.toContain('clip-path');
  });

  it('prefers the cut to the fade when both apply, because movement is the question', () => {
    stubDocument(true, false);
    expect(wipe(node).duration).toBe(0);
  });
});
