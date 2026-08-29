import { describe, expect, it } from 'vitest';
import {
  isBadMomentEntry,
  shouldShowSafeSpaceNudge,
  BAD_MOMENT_MOOD_CEILING,
  BAD_MOMENT_REGION_DYSPHORIA_FLOOR,
  BAD_MOMENT_DIMENSION_DYSPHORIA_CEILING
} from './safeSpaceNudge';

describe('isBadMomentEntry', () => {
  it('triggers on lowest mood step (mood === 1)', () => {
    expect(isBadMomentEntry({ mood: 1 })).toBe(true);
    expect(isBadMomentEntry({ mood: 2 })).toBe(false);
    expect(isBadMomentEntry({ mood: 3 })).toBe(false);
    expect(isBadMomentEntry({ mood: null })).toBe(false);
  });

  it('triggers on dysphoria tags', () => {
    expect(isBadMomentEntry({ tags: ['g-soc-dys'] })).toBe(true);
    expect(isBadMomentEntry({ tags: ['g-body-dys'] })).toBe(true);
    expect(isBadMomentEntry({ tags: ['g-transphobia'] })).toBe(true);
    expect(isBadMomentEntry({ tags: ['g-misgendered'] })).toBe(true);
    expect(isBadMomentEntry({ tags: ['dt-physical'] })).toBe(true);
    expect(isBadMomentEntry({ tags: ['dt-existential'] })).toBe(true);

    // Non-dysphoria tags do not trigger
    expect(isBadMomentEntry({ tags: ['g-euphoria', 'e-happy'] })).toBe(false);
    expect(isBadMomentEntry({ tags: ['e-sad'] })).toBe(false);
  });

  it('triggers on body region feeling dysphoria >= 50', () => {
    expect(
      isBadMomentEntry({
        bodyRegions: { chest: { dysphoria: 50 } }
      })
    ).toBe(true);
    expect(
      isBadMomentEntry({
        bodyRegions: { face_jaw: { dysphoria: 80 } }
      })
    ).toBe(true);
    expect(
      isBadMomentEntry({
        bodyRegions: { chest: { dysphoria: 49 } }
      })
    ).toBe(false);
    expect(
      isBadMomentEntry({
        bodyRegions: { chest: { euphoria: 100 } }
      })
    ).toBe(false);
  });

  it('triggers on euphoria_dysphoria dimension <= 20', () => {
    expect(
      isBadMomentEntry({
        dims: { euphoria_dysphoria: 20 }
      })
    ).toBe(true);
    expect(
      isBadMomentEntry({
        dims: { euphoria_dysphoria: 10 }
      })
    ).toBe(true);
    expect(
      isBadMomentEntry({
        dims: { euphoria_dysphoria: 21 }
      })
    ).toBe(false);
    expect(
      isBadMomentEntry({
        dims: { femininity: 10 }
      })
    ).toBe(false);
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
