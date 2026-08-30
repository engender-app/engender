/* Letter sealed/unlocked status (phase 4 ticket 19, phase 5 ticket 01). */

import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'vitest';
import type { Letter } from './types.ts';
import {
  clearLetterSnooze,
  getReadLetterIds,
  isLetterSealed,
  isLetterSnoozed,
  markLetterRead,
  snoozeLetterTile,
  unreadUnlockedLetters
} from './letterStatus.ts';

class MemoryStorage implements Storage {
  private store = new Map<string, string>();
  get length(): number {
    return this.store.size;
  }
  clear(): void {
    this.store.clear();
  }
  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }
  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
}

describe('letterStatus', () => {
  let storage: MemoryStorage;

  beforeEach(() => {
    storage = new MemoryStorage();
  });

  it('a letter is sealed strictly before its unlock day', () => {
    assert.equal(isLetterSealed({ unlockEpochDay: 200 }, 100), true);
  });

  it('a letter unlocks on its unlock day, and stays unlocked after it', () => {
    assert.equal(isLetterSealed({ unlockEpochDay: 200 }, 200), false);
    assert.equal(isLetterSealed({ unlockEpochDay: 200 }, 500), false);
  });

  it('unreadUnlockedLetters filters out sealed and read letters and sorts oldest unlock first', () => {
    const letters: Letter[] = [
      { id: 'let-1', epochDay: 100, text: 'First letter', unlockEpochDay: 150 },
      { id: 'let-2', epochDay: 110, text: 'Second letter', unlockEpochDay: 130 },
      { id: 'let-3', epochDay: 120, text: 'Third sealed', unlockEpochDay: 250 },
      { id: 'let-4', epochDay: 90, text: 'Already read', unlockEpochDay: 120 }
    ];

    const today = 200;
    const readIds = new Set(['let-4']);
    const unread = unreadUnlockedLetters(letters, today, readIds);

    assert.equal(unread.length, 2);
    // let-2 has unlockEpochDay 130, let-1 has unlockEpochDay 150 -> let-2 is oldest unlocked
    assert.equal(unread[0].id, 'let-2');
    assert.equal(unread[1].id, 'let-1');
  });

  it('tracks read letters in storage', () => {
    assert.equal(getReadLetterIds(storage).size, 0);
    markLetterRead('let-1', storage);
    markLetterRead('let-2', storage);
    assert.deepEqual(Array.from(getReadLetterIds(storage)), ['let-1', 'let-2']);
  });

  it('handles 24h snooze in storage with virtual time', () => {
    const now = 1000000000;
    assert.equal(isLetterSnoozed(now, storage), false);

    snoozeLetterTile(now, storage);
    assert.equal(isLetterSnoozed(now, storage), true);
    assert.equal(isLetterSnoozed(now + 3600_000, storage), true); // 1h later
    assert.equal(isLetterSnoozed(now + 86400_000 - 1, storage), true); // just under 24h
    assert.equal(isLetterSnoozed(now + 86400_000 + 1, storage), false); // 24h and 1ms later

    snoozeLetterTile(now, storage);
    clearLetterSnooze(storage);
    assert.equal(isLetterSnoozed(now, storage), false);
  });
});
