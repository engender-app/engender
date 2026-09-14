/* Letter sealed/unlocked status (phase 4 ticket 19, phase 5 ticket 01). */

import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'vitest';
import type { Letter } from './types.ts';
import {
  clearLetterSnooze,
  getGreetedLetterIds,
  getReadLetterIds,
  isLetterSealed,
  isLetterSnoozed,
  letterToGreet,
  markLetterGreeted,
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

  /* Ticket 45: a letter whose unlock day is today takes the whole screen
     once, and only once. "Once" is a per-letter fact that has to survive a
     reload, so it lives beside the read set rather than in component state,
     and the arrival is refused for a letter already met either way. */
  describe('the arrival', () => {
    const seal = (id: string, epochDay: number, unlockEpochDay: number) => ({
      id,
      epochDay,
      unlockEpochDay
    });

    it('greets a letter whose unlock day is today', () => {
      const letters = [seal('let-1', 100, 500)];
      assert.equal(letterToGreet(letters, 500, new Set())?.id, 'let-1');
    });

    it('refuses a letter still sealed and one that unlocked on an earlier day', () => {
      const letters = [seal('sealed', 100, 501), seal('yesterday', 100, 499)];
      assert.equal(letterToGreet(letters, 500, new Set()), null);
    });

    it('refuses a letter already met, whether greeted or read', () => {
      const letters = [seal('let-1', 100, 500)];
      assert.equal(letterToGreet(letters, 500, new Set(['let-1'])), null);
    });

    it('takes the oldest written first where two letters unlock on one day', () => {
      const letters = [seal('newer', 200, 500), seal('older', 100, 500)];
      assert.equal(letterToGreet(letters, 500, new Set())?.id, 'older');
      assert.equal(letterToGreet(letters, 500, new Set(['older']))?.id, 'newer');
    });

    it('tracks greeted letters in storage, apart from the read ones', () => {
      assert.equal(getGreetedLetterIds(storage).size, 0);
      markLetterGreeted('let-1', storage);
      assert.deepEqual(Array.from(getGreetedLetterIds(storage)), ['let-1']);
      assert.equal(getReadLetterIds(storage).size, 0);
    });
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
