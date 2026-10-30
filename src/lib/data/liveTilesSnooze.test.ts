import { describe, expect, it, beforeEach } from 'vitest';
import {
  clearSnooze,
  DEFAULT_SNOOZE_DURATION_MS,
  isTileSnoozed,
  snoozeKey,
  snoozeTile
} from './liveTilesSnooze.ts';

function createFakeStorage(initial: Record<string, string> = {}): Storage {
  const store = new Map<string, string>(Object.entries(initial));
  return {
    get length() {
      return store.size;
    },
    key(index: number) {
      return [...store.keys()][index] ?? null;
    },
    getItem(key: string) {
      return store.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
    removeItem(key: string) {
      store.delete(key);
    },
    clear() {
      store.clear();
    }
  } as Storage;
}

describe('liveTilesSnooze', () => {
  let storage: Storage;
  const now = 1_700_000_000_000;

  beforeEach(() => {
    storage = createFakeStorage();
  });

  it('generates predictable storage keys', () => {
    expect(snoozeKey('surgery-countdown')).toBe('engender-tile-snooze-surgery-countdown');
  });

  it('reports unsnoozed when nothing is stored', () => {
    expect(isTileSnoozed('surgery-countdown', now, storage)).toBe(false);
  });

  it('snoozes tile for default 24h interval', () => {
    snoozeTile('surgery-countdown', undefined, now, storage);
    expect(isTileSnoozed('surgery-countdown', now, storage)).toBe(true);
    expect(isTileSnoozed('surgery-countdown', now + DEFAULT_SNOOZE_DURATION_MS - 1, storage)).toBe(true);
    expect(isTileSnoozed('surgery-countdown', now + DEFAULT_SNOOZE_DURATION_MS + 1, storage)).toBe(false);
  });

  it('snoozes tile for custom duration', () => {
    const duration = 1000 * 60 * 60 * 48; // 48 hours
    snoozeTile('safe-space-nudge', duration, now, storage);
    expect(isTileSnoozed('safe-space-nudge', now + 1000 * 60 * 60 * 24, storage)).toBe(true);
    expect(isTileSnoozed('safe-space-nudge', now + duration + 1, storage)).toBe(false);
  });

  it('clears snooze explicitly', () => {
    snoozeTile('surgery-countdown', DEFAULT_SNOOZE_DURATION_MS, now, storage);
    expect(isTileSnoozed('surgery-countdown', now, storage)).toBe(true);

    clearSnooze('surgery-countdown', storage);
    expect(isTileSnoozed('surgery-countdown', now, storage)).toBe(false);
  });

  it('handles corrupted localStorage values safely', () => {
    storage.setItem(snoozeKey('surgery-countdown'), 'invalid-json-and-not-a-number');
    expect(isTileSnoozed('surgery-countdown', now, storage)).toBe(false);
  });
});
