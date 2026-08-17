import { describe, expect, it } from 'vitest';

import { isReducedMotion, motionDistance, motionDuration } from './tokens';

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
  it('fall back to the caller-supplied value', () => {
    expect(motionDuration('--dur-med', 240)).toBe(240);
    expect(motionDistance('--motion-distance-md', 24)).toBe(24);
  });
});
