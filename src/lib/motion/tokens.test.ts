import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { DISTANCE_FALLBACK, DURATION_FALLBACK, NIL_OPACITY, isReducedMotion, motionDistance, motionDuration } from './tokens';

const root = fileURLToPath(new URL('../../../', import.meta.url));

describe('isReducedMotion', () => {
  it('is true when the document is marked reduced', () => {
    expect(isReducedMotion({ documentElement: { dataset: { a11yMotion: 'reduce' } } })).toBe(true);
  });

  it('is false for a normal document', () => {
    expect(isReducedMotion({ documentElement: { dataset: {} } })).toBe(false);
  });

  it('is false with no document available (SSR)', () => {
    expect(isReducedMotion(undefined)).toBe(false);
  });
});

describe('motionDuration and motionDistance without a DOM', () => {
  it('fall back to the token\'s own authored value', () => {
    expect(motionDuration('--dur-med')).toBe(240);
    expect(motionDistance('--motion-distance-md')).toBe(24);
  });
});

/* Ticket 15 (MO-004): the fallback used to be a second parameter every
   caller restated by hand, and it had already drifted - --dur-fast is
   authored at 150ms and two call sites passed 160. Held against base.css
   itself, the same way flagSun.test.ts holds its palette list against
   palettes.css, so the next drift fails here instead of shipping. */
describe('the fallback table agrees with what base.css authors', () => {
  const base = readFileSync(join(root, 'src/lib/theme/base.css'), 'utf8');

  it('every duration token', () => {
    for (const [token, fallback] of Object.entries(DURATION_FALLBACK)) {
      const match = new RegExp(`${token}:\\s*(\\d+)ms`).exec(base);
      expect(match, `${token} should be authored in ms in base.css`).not.toBeNull();
      expect(Number(match![1]), token).toBe(fallback);
    }
  });

  it('every distance token', () => {
    for (const [token, fallback] of Object.entries(DISTANCE_FALLBACK)) {
      const match = new RegExp(`${token}:\\s*(\\d+)px`).exec(base);
      expect(match, `${token} should be authored in px in base.css`).not.toBeNull();
      expect(Number(match![1]), token).toBe(fallback);
    }
  });
});

/* Ticket 09: content fading in from 0 is not drawn until its fade's first
   frame, and on the Pixel that frame stalled the motion. Every arrival
   starts at the nil opacity instead, the stylesheet's as well as the
   script's. */
describe('arrivals start at the nil opacity', () => {
  const base = readFileSync(join(root, 'src/lib/theme/base.css'), 'utf8');
  const app = readFileSync(join(root, 'src/lib/styles/app.css'), 'utf8');

  it('base.css publishes the same value as NIL_OPACITY', () => {
    expect(base).toContain(`--nil-opacity: ${NIL_OPACITY};`);
  });

  it.each(['screen-fade-in', 'screen-axis-in', 'screen-axis-back-in', 'screen-crossfade', 'field-part-in'])(
    '%s starts at it, not at 0',
    (name) => {
      const frames = new RegExp(`@keyframes ${name} \\{\\s*from \\{ ([^}]*)\\}`).exec(app);
      expect(frames, `@keyframes ${name}`).not.toBeNull();
      expect(frames![1]).toContain('opacity: var(--nil-opacity)');
    }
  );

  it('no arrival keyframe in the app stylesheet starts from opacity 0', () => {
    const fromZero = [...app.matchAll(/@keyframes ([\w-]+-in) \{\s*from \{[^}]*opacity: 0[;\s}]/g)].map((m) => m[1]);
    expect(fromZero).toEqual([]);
  });
});
