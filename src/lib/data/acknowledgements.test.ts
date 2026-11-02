/* The acknowledgements preference's rules, and the first-unlock move out of
   the plaintext keys older builds used (functional audit ticket 45). */

import { describe, expect, it, vi } from 'vitest';
import {
  NO_ACKNOWLEDGEMENTS,
  foldLegacyAcknowledgements,
  migrateLegacyAcknowledgements,
  sanitizeAcknowledgements,
  withLetterRead,
  withSnooze
} from './acknowledgements.ts';

const A = '0b2f6c1e-5d3a-4f7e-9a10-1c2d3e4f5a6b';
const B = '7e9d4c2a-8b1f-4a3c-b5d6-0f1e2d3c4b5a';
const NOW = 1_800_000_000_000;

class MemoryStorage {
  private store = new Map<string, string>();
  constructor(initial: Record<string, string> = {}) {
    for (const [key, value] of Object.entries(initial)) this.store.set(key, value);
  }
  get length() { return this.store.size; }
  key(index: number) { return [...this.store.keys()][index] ?? null; }
  getItem(key: string) { return this.store.get(key) ?? null; }
  removeItem(key: string) { this.store.delete(key); }
  keys() { return [...this.store.keys()].sort(); }
}

const legacy = () =>
  new MemoryStorage({
    'engender-read-letter-ids': JSON.stringify([A]),
    'engender-greeted-letter-ids': JSON.stringify([A, B]),
    'engender-has-entries': '1',
    'letter_tile_snooze_until': String(NOW + 1000),
    'engender-tile-snooze-surgery-countdown': String(NOW + 2000),
    'engender-boot-prefs': '{}',
    'engender-pin-attempts': '{}'
  });

describe('the shape', () => {
  it('sanitises each field alone, so one bad field costs only itself', () => {
    const value = sanitizeAcknowledgements({
      snoozes: { good: 5, bad: 'soon', worse: NaN },
      readLetterIds: [A, 7, 'not-a-uuid', A],
      greetedLetterIds: 'nope',
      hasEntries: 'yes'
    });
    expect(value).toEqual({ snoozes: { good: 5 }, readLetterIds: [A], greetedLetterIds: [], hasEntries: null });
  });

  it('takes anything that is not an object as nothing', () => {
    expect(sanitizeAcknowledgements(null)).toEqual(NO_ACKNOWLEDGEMENTS);
    expect(sanitizeAcknowledgements([A])).toEqual(NO_ACKNOWLEDGEMENTS);
  });

  it('never edits the value it was handed', () => {
    const next = withLetterRead(withSnooze(NO_ACKNOWLEDGEMENTS, 'ready-letter', NOW + 5, NOW), A);
    expect(NO_ACKNOWLEDGEMENTS.readLetterIds).toEqual([]);
    expect(NO_ACKNOWLEDGEMENTS.snoozes).toEqual({});
    expect(next.readLetterIds).toEqual([A]);
  });

  it('drops snoozes that have already ended when it writes a new one', () => {
    const ack = withSnooze(withSnooze(NO_ACKNOWLEDGEMENTS, 'old', NOW - 1, NOW - 10), 'new', NOW + 1, NOW);
    expect(Object.keys(ack.snoozes)).toEqual(['new']);
  });
});

describe('moving the plaintext keys on first unlock', () => {
  it('folds every old key in, keeps the letters read and met apart, and names the letter tile ready-letter', async () => {
    const storage = legacy();
    const persist = vi.fn(async () => {});
    expect(await migrateLegacyAcknowledgements(storage, NO_ACKNOWLEDGEMENTS, persist)).toBe(true);
    expect(persist).toHaveBeenCalledWith({
      snoozes: { 'ready-letter': NOW + 1000, 'surgery-countdown': NOW + 2000 },
      readLetterIds: [A],
      greetedLetterIds: [A, B],
      hasEntries: true
    });
  });

  it('deletes the old keys it moved and nothing else', async () => {
    const storage = legacy();
    await migrateLegacyAcknowledgements(storage, NO_ACKNOWLEDGEMENTS, async () => {});
    expect(storage.keys()).toEqual(['engender-boot-prefs', 'engender-pin-attempts']);
  });

  it('keeps every old key when the write does not land, and the next unlock tries again', async () => {
    const storage = legacy();
    const before = storage.keys();
    const failing = vi.fn(async () => { throw new Error('disk full'); });
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await migrateLegacyAcknowledgements(storage, NO_ACKNOWLEDGEMENTS, failing)).toBe(false);
    quiet.mockRestore();
    expect(storage.keys()).toEqual(before);

    const retry = vi.fn(async () => {});
    expect(await migrateLegacyAcknowledgements(storage, NO_ACKNOWLEDGEMENTS, retry)).toBe(true);
    expect(retry).toHaveBeenCalledOnce();
    expect(storage.keys()).toEqual(['engender-boot-prefs', 'engender-pin-attempts']);
  });

  it('writes nothing when there is nothing to move', async () => {
    const persist = vi.fn(async () => {});
    const storage = new MemoryStorage({ 'engender-boot-prefs': '{}' });
    expect(await migrateLegacyAcknowledgements(storage, NO_ACKNOWLEDGEMENTS, persist)).toBe(false);
    expect(persist).not.toHaveBeenCalled();
    expect(await migrateLegacyAcknowledgements(null, NO_ACKNOWLEDGEMENTS, persist)).toBe(false);
  });

  it('keeps what is already saved where a fact has one answer, and unions the letter ids', () => {
    const storage = legacy();
    const current = {
      snoozes: { 'ready-letter': NOW + 9 },
      readLetterIds: [B],
      greetedLetterIds: [],
      hasEntries: false
    };
    const folded = foldLegacyAcknowledgements(current, storage, storage.keys());
    expect(folded.snoozes['ready-letter']).toBe(NOW + 9);
    expect(folded.snoozes['surgery-countdown']).toBe(NOW + 2000);
    expect(folded.readLetterIds).toEqual([B, A]);
    expect(folded.hasEntries).toBe(false);
  });

  it('does not make a malformed id portable', () => {
    const storage = new MemoryStorage({
      'engender-read-letter-ids': JSON.stringify([A, 12, 'let-1', { id: B }, null]),
      'engender-tile-snooze-x': 'soon'
    });
    const folded = foldLegacyAcknowledgements(NO_ACKNOWLEDGEMENTS, storage, storage.keys());
    expect(folded.readLetterIds).toEqual([A]);
    expect(folded.snoozes).toEqual({});
  });

  it('survives an unreadable old value', () => {
    const storage = new MemoryStorage({ 'engender-greeted-letter-ids': '{not json' });
    expect(foldLegacyAcknowledgements(NO_ACKNOWLEDGEMENTS, storage, storage.keys())).toEqual(NO_ACKNOWLEDGEMENTS);
  });
});
