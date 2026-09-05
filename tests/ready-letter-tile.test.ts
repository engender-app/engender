/* Contract and behavioral tests for ready-letter live tile (ticket 01).
   Verifies:
   - Tile appearance criteria on Home for unlocked, unread time-capsule letters.
   - Oldest unlocked letter prioritization and multi-letter remaining count.
   - Dismissal & 24-hour snooze behavior and restoration past 24 hours.
   - "Don't show again" preference gating.
   - Resolution on reading the letter.
   - Presence in live-tiles settings registry and localization messages. */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  clearLetterSnooze,
  getReadLetterIds,
  isLetterSealed,
  isLetterSnoozed,
  markLetterRead,
  snoozeLetterTile,
  unreadUnlockedLetters
} from '../src/lib/data/letterStatus.ts';
import type { Letter } from '../src/lib/data/types.ts';
import { UNPROMPTED_ROWS } from '../src/lib/unprompted/registry.ts';
import { LIVE_TILE_ORDER } from '../src/lib/data/liveTiles.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path: string) => readFileSync(root + path, 'utf8');

const home = read('src/routes/+page.svelte');
const homeMarkup = home.replace(/<script[\s\S]*?<\/script>/g, '');
const lettersPage = read('src/routes/transition/letters/+page.svelte');
const letterIdPage = read('src/routes/transition/letters/[id]/+page.svelte');
const enMessages = JSON.parse(read('messages/en.json'));
const plMessages = JSON.parse(read('messages/pl.json'));

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

describe('Ready letter status logic (ticket 01)', () => {
  it('identifies sealed vs unlocked letters by todayEpochDay', () => {
    expect(isLetterSealed({ unlockEpochDay: 150 }, 100)).toBe(true);
    expect(isLetterSealed({ unlockEpochDay: 150 }, 150)).toBe(false);
    expect(isLetterSealed({ unlockEpochDay: 150 }, 200)).toBe(false);
  });

  it('filters unread unlocked letters and sorts oldest unlockEpochDay first', () => {
    const letters: Letter[] = [
      { id: 'let-future', epochDay: 50, text: 'Still sealed', unlockEpochDay: 300 },
      { id: 'let-recent-unlock', epochDay: 80, text: 'Unlocked later', unlockEpochDay: 150 },
      { id: 'let-oldest-unlock', epochDay: 40, text: 'Unlocked first', unlockEpochDay: 120 },
      { id: 'let-already-read', epochDay: 30, text: 'Read earlier', unlockEpochDay: 110 }
    ];

    const today = 200;
    const readIds = new Set(['let-already-read']);
    const ready = unreadUnlockedLetters(letters, today, readIds);

    expect(ready.length).toBe(2);
    expect(ready[0].id).toBe('let-oldest-unlock');
    expect(ready[1].id).toBe('let-recent-unlock');
  });

  it('marks letters as read and excludes them from unreadUnlockedLetters', () => {
    const storage = new MemoryStorage();
    const letters: Letter[] = [
      { id: 'let-1', epochDay: 50, text: 'Letter 1', unlockEpochDay: 100 },
      { id: 'let-2', epochDay: 60, text: 'Letter 2', unlockEpochDay: 120 }
    ];

    const today = 150;
    expect(unreadUnlockedLetters(letters, today, getReadLetterIds(storage)).length).toBe(2);

    markLetterRead('let-1', storage);
    const readIds = getReadLetterIds(storage);
    expect(readIds.has('let-1')).toBe(true);

    const remaining = unreadUnlockedLetters(letters, today, readIds);
    expect(remaining.length).toBe(1);
    expect(remaining[0].id).toBe('let-2');
  });

  it('manages 24-hour snooze suppression and restores after 24 hours', () => {
    const storage = new MemoryStorage();
    const now = 1700000000000;

    expect(isLetterSnoozed(now, storage)).toBe(false);

    snoozeLetterTile(now, storage);
    expect(isLetterSnoozed(now, storage)).toBe(true);
    expect(isLetterSnoozed(now + 12 * 3600_000, storage)).toBe(true);
    expect(isLetterSnoozed(now + 24 * 3600_000 - 100, storage)).toBe(true);

    // After 24 hours elapse, snooze expires and tile restores
    expect(isLetterSnoozed(now + 24 * 3600_000 + 1, storage)).toBe(false);

    // Explicit clear
    snoozeLetterTile(now, storage);
    clearLetterSnooze(storage);
    expect(isLetterSnoozed(now, storage)).toBe(false);
  });
});

describe('Home ready-letter live tile rendering and behavior', () => {
  /* The tile itself moved into the grid module (phase 8 deepening ticket
     07), so its content, its route and its dismiss are asserted through
     `composeHomeTiles` in liveTiles.grid.test.ts. What stays here is the
     half that is still Home's: the sheet the dismiss opens, which is a
     surface on the route rather than a control on the tile. */
  it('gating derives on preference, unread letters query, and snooze state', () => {
    const tiles = read('src/lib/data/liveTiles.svelte.ts');
    expect(tiles).toContain('j.letters.getLetterSeals(100)');
    // The letter keeps its own storage key rather than liveTilesSnooze's.
    expect(tiles).toContain('isLetterSnoozed(nowMs)');
    expect(read('src/lib/data/liveTiles.ts')).toContain('unreadUnlockedLetters(reads.letters, today)');
    expect(home).not.toContain('getLetters(');
  });

  it('renders ready-letter tile inside TileGrid with tileSlide transition', () => {
    expect(LIVE_TILE_ORDER as readonly string[]).toContain('ready-letter');
    expect(homeMarkup).toContain('<TileGrid');
    expect(homeMarkup).toContain('transition:tileSlide');
  });

  it('provides dismiss sheet with 24h snooze and permanent disable actions', () => {
    expect(homeMarkup).toContain('data-letter-dismiss-sheet');
    expect(homeMarkup).toContain('data-letter-snooze');
    expect(homeMarkup).toContain('data-letter-dont-show');
    // The snooze goes through the module, which is what makes the tile
    // disappear the moment the sheet closes rather than a tick later.
    expect(home).toContain("liveTiles.snooze('ready-letter')");
    expect(home).toContain('prefs.readyLetterEnabled = false');
  });

  it('links tile to the letter reading route', () => {
    expect(read('src/lib/data/liveTiles.ts')).toContain('/transition/letters?read=${letter.id}');
  });
});

describe('Settings and letter route integration', () => {
  it('registers ready-letter in live-tiles settings registry', () => {
    const row = UNPROMPTED_ROWS.find((r) => r.key === 'ready-letter');
    expect(row).toBeDefined();
    expect(row?.surface?.prefKey).toBe('readyLetterEnabled');
    expect(row?.title()).toBe(enMessages.tile_letter_title);
  });

  it('marks letter as read on opening /transition/letters or [id]', () => {
    expect(lettersPage).toContain('markLetterRead(letter.id)');
    expect(lettersPage).toContain("page.url.searchParams.get('read')");
    // The [id] route (phase 5 deepening ticket 13) renders the letter's own
    // text in place rather than bouncing back to the list; it marks read
    // once that text has actually been shown.
    expect(letterIdPage).toContain('markLetterRead(id)');
    expect(letterIdPage).toContain('!isLetterSealed(letter, today)');
  });
});

describe('Localization keys for ready letter live tile', () => {
  const requiredKeys = [
    'tile_letter_title',
    'tile_letter_sub',
    'tile_letter_dismiss_action',
    'tile_letter_dismiss_title',
    'tile_letter_dismiss_hint',
    'tile_letter_snooze_btn',
    'tile_letter_dont_show_btn',
    'tile_letter_snoozed_toast',
    'tile_letter_single_note',
    'tile_letter_more'
  ];

  for (const key of requiredKeys) {
    it(`contains ${key} in both en.json and pl.json`, () => {
      expect(enMessages[key]).toBeTruthy();
      expect(plMessages[key]).toBeTruthy();
    });
  }
});
