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
    expect(snoozeKey('patch-schedule-tile')).toBe('engender-tile-snooze-patch-schedule-tile');
  });

  it('reports unsnoozed when nothing is stored', () => {
    expect(isTileSnoozed('patch-schedule-tile', now, storage)).toBe(false);
  });

  it('snoozes tile for default 24h interval', () => {
    snoozeTile('patch-schedule-tile', undefined, now, storage);
    expect(isTileSnoozed('patch-schedule-tile', now, storage)).toBe(true);
    expect(isTileSnoozed('patch-schedule-tile', now + DEFAULT_SNOOZE_DURATION_MS - 1, storage)).toBe(true);
    expect(isTileSnoozed('patch-schedule-tile', now + DEFAULT_SNOOZE_DURATION_MS + 1, storage)).toBe(false);
  });

  it('snoozes tile for custom duration', () => {
    const duration = 1000 * 60 * 60 * 48; // 48 hours
    snoozeTile('pause-active-banner', duration, now, storage);
    expect(isTileSnoozed('pause-active-banner', now + 1000 * 60 * 60 * 24, storage)).toBe(true);
    expect(isTileSnoozed('pause-active-banner', now + duration + 1, storage)).toBe(false);
  });

  it('clears snooze explicitly', () => {
    snoozeTile('patch-schedule-tile', DEFAULT_SNOOZE_DURATION_MS, now, storage);
    expect(isTileSnoozed('patch-schedule-tile', now, storage)).toBe(true);

    clearSnooze('patch-schedule-tile', storage);
    expect(isTileSnoozed('patch-schedule-tile', now, storage)).toBe(false);
  });

  it('handles corrupted localStorage values safely', () => {
    storage.setItem(snoozeKey('patch-schedule-tile'), 'invalid-json-and-not-a-number');
    expect(isTileSnoozed('patch-schedule-tile', now, storage)).toBe(false);
  });
});
