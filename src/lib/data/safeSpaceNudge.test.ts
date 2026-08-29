import { describe, expect, it } from 'vitest';
import {
  shouldShowSafeSpaceNudge,
  BAD_MOMENT_MOOD_CEILING,
  BAD_MOMENT_REGION_DYSPHORIA_FLOOR,
  DYSPHORIA_TAG_KEYS
} from './safeSpaceNudge';

describe('Safe Space nudge constants and tags', () => {
  it('defines lowest mood floor and region dysphoria threshold', () => {
    expect(BAD_MOMENT_MOOD_CEILING).toBe(1);
    expect(BAD_MOMENT_REGION_DYSPHORIA_FLOOR).toBe(50);
  });

  it('includes built-in gender dysphoria tags and dysphoria_type group tags', () => {
    expect(DYSPHORIA_TAG_KEYS).toContain('g-soc-dys');
    expect(DYSPHORIA_TAG_KEYS).toContain('g-body-dys');
    expect(DYSPHORIA_TAG_KEYS).toContain('g-transphobia');
    expect(DYSPHORIA_TAG_KEYS).toContain('g-misgendered');
    expect(DYSPHORIA_TAG_KEYS).toContain('dt-physical');
    expect(DYSPHORIA_TAG_KEYS).toContain('dt-biochemical');
    expect(DYSPHORIA_TAG_KEYS).toContain('dt-social');
    expect(DYSPHORIA_TAG_KEYS).toContain('dt-societal');
    expect(DYSPHORIA_TAG_KEYS).toContain('dt-sexual');
    expect(DYSPHORIA_TAG_KEYS).toContain('dt-presentational');
    expect(DYSPHORIA_TAG_KEYS).toContain('dt-existential');
  });
});

describe('shouldShowSafeSpaceNudge', () => {
  it('returns false when disabled in settings', () => {
    expect(
      shouldShowSafeSpaceNudge({
        latestBadEntryId: 42,
        dismissedEntryId: null,
        enabled: false
      })
    ).toBe(false);
  });

  it('returns false when no bad entry exists', () => {
    expect(
      shouldShowSafeSpaceNudge({
        latestBadEntryId: null,
        dismissedEntryId: null,
        enabled: true
      })
    ).toBe(false);
  });

  it('returns true when an unhandled bad entry exists', () => {
    expect(
      shouldShowSafeSpaceNudge({
        latestBadEntryId: 42,
        dismissedEntryId: null,
        enabled: true
      })
    ).toBe(true);
  });

  it('returns false when latest bad entry has been dismissed or handled', () => {
    expect(
      shouldShowSafeSpaceNudge({
        latestBadEntryId: 42,
        dismissedEntryId: 42,
        enabled: true
      })
    ).toBe(false);
    expect(
      shouldShowSafeSpaceNudge({
        latestBadEntryId: 42,
        dismissedEntryId: 50,
        enabled: true
      })
    ).toBe(false);
  });

  it('returns true when a fresh bad entry is logged after a previous dismissal', () => {
    expect(
      shouldShowSafeSpaceNudge({
        latestBadEntryId: 43,
        dismissedEntryId: 42,
        enabled: true
      })
    ).toBe(true);
  });
});
