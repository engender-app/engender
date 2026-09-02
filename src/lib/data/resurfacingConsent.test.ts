import { describe, expect, it } from 'vitest';
import { touchesMutedEra } from './resurfacingConsent';
import type { EraSpan } from './eras';

const era = (name: string, startEpochDay: number | null, endEpochDay: number | null, id = name): EraSpan => ({
  id,
  name,
  startEpochDay,
  endEpochDay
});

describe('touchesMutedEra', () => {
  const eras = [era('before I knew', null, 99), era('first year', 100, 200), era('now', 300, null)];

  it('is false with nothing muted at all', () => {
    expect(touchesMutedEra(eras, new Set(), 50, 60)).toBe(false);
  });

  it('is false for a day in an era nobody muted', () => {
    expect(touchesMutedEra(eras, new Set(['now']), 150, 150)).toBe(false);
  });

  it('is true for a single day inside a muted era - the degenerate one-day range', () => {
    expect(touchesMutedEra(eras, new Set(['before I knew']), 50, 50)).toBe(true);
  });

  it('is true when the range straddles the edge of a muted era', () => {
    expect(touchesMutedEra(eras, new Set(['first year']), 190, 250)).toBe(true);
  });

  it('is true when a muted era sits entirely inside a wider range, touching neither endpoint', () => {
    // A year wrapped, with "first year" muted somewhere in the middle of it.
    expect(touchesMutedEra(eras, new Set(['first year']), 0, 1000)).toBe(true);
  });

  it('is false for a day in no era at all, the resting state eraForDay already gives it', () => {
    expect(touchesMutedEra(eras, new Set(['before I knew', 'first year', 'now']), 250, 250)).toBe(false);
  });

  it('reads a mute naming a since-deleted era as no mute, with no error', () => {
    // The mute row outlives the era: `eras` here no longer holds it.
    const afterDeletion = [era('first year', 100, 200), era('now', 300, null)];
    expect(() => touchesMutedEra(afterDeletion, new Set(['before I knew']), 50, 50)).not.toThrow();
    expect(touchesMutedEra(afterDeletion, new Set(['before I knew']), 50, 50)).toBe(false);
  });

  it('is true across the whole open reach of an unbounded muted era', () => {
    expect(touchesMutedEra(eras, new Set(['now']), 999999, 999999)).toBe(true);
    expect(touchesMutedEra(eras, new Set(['before I knew']), -40000, -40000)).toBe(true);
  });
});
