/* Whether a time-capsule letter is sealed or unlocked (phase 4 ticket 19,
   phase 5 ticket 01).

   Nothing here is stored in SQLite (ADR-0010) - the schema has no `sealed`
   column, and whether a letter is readable is a question about today, which
   changes overnight. It sits above the journal for the same reason
   milestoneStatus.ts does: "today" is a local calendar day (ADR-0001) and
   the data layer has no business deciding which one it is, so today
   arrives as an argument.

   Once `unlockEpochDay` is on or before today the letter stays unlocked
   for good - there is no re-sealing - which is why this is a single
   comparison rather than a three-way status like milestoneStatus()'s.

   Live tile state (read resolution and 24h snooze) lives in localStorage
   outside SQLite (ADR-0039). */

import { isSealedUntil } from './sealedUntil';
import type { LetterSeal } from './journal/letters';
import type { Letter } from './types';

const LETTER_TILE_SNOOZE_STORAGE_KEY = 'letter_tile_snooze_until';
const READ_LETTERS_STORAGE_KEY = 'engender-read-letter-ids';
const GREETED_LETTERS_STORAGE_KEY = 'engender-greeted-letter-ids';
const SNOOZE_DURATION_MS = 24 * 60 * 60 * 1000;

function resolveStorage(storage?: Storage): Storage | null {
  if (storage) return storage;
  if (typeof localStorage !== 'undefined') return localStorage;
  return null;
}

/* Two sets of letter ids are kept out here now - the ones whose text has
   been shown, and the ones whose arrival has been met (ticket 45) - and they
   are the same shape, so the reading and the writing are written once. */
function readIdSet(key: string, storage?: Storage): Set<string> {
  const s = resolveStorage(storage);
  if (!s) return new Set();
  try {
    const raw = s.getItem(key);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed.map(String)) : new Set();
  } catch {
    return new Set();
  }
}

function addToIdSet(key: string, id: string, storage?: Storage): void {
  const s = resolveStorage(storage);
  if (!s) return;
  const current = readIdSet(key, s);
  current.add(id);
  try {
    s.setItem(key, JSON.stringify(Array.from(current)));
  } catch {
    // Storage quota or disabled storage is ignored gracefully.
  }
}

export function isLetterSealed(letter: Pick<Letter, 'unlockEpochDay'>, todayEpochDay: number): boolean {
  return isSealedUntil(letter.unlockEpochDay, todayEpochDay);
}

/* getReadLetterIds stays exported for its own test, and cross-checked in
   ready-letter-tile.test.ts (AU-09 test-only review). */
export function getReadLetterIds(storage?: Storage): Set<string> {
  return readIdSet(READ_LETTERS_STORAGE_KEY, storage);
}

export function markLetterRead(letterId: string, storage?: Storage): void {
  addToIdSet(READ_LETTERS_STORAGE_KEY, letterId, storage);
}

/** The letters whose arrival has already been met (ticket 45).

    A separate set from the read one, because the two facts differ: a person
    can be shown a letter's arrival and choose to leave it closed, and that
    letter is met but unread - the live tile on Today still has something to
    say about it, and the arrival does not. */
export function getGreetedLetterIds(storage?: Storage): Set<string> {
  return readIdSet(GREETED_LETTERS_STORAGE_KEY, storage);
}

export function markLetterGreeted(letterId: string, storage?: Storage): void {
  addToIdSet(GREETED_LETTERS_STORAGE_KEY, letterId, storage);
}

/** The letter whose arrival is owed right now, or null.

    Exactly the letters unlocking **today** - a letter that unlocked
    yesterday has had its day and gets no screen, and a sealed one is not
    the app's to offer. `metIds` is the union of the greeted and the read,
    since either is a person having already met the letter.

    Oldest written first where a day carries two, so they are met one at a
    time in the order they were written rather than in whatever order a
    query returned. */
export function letterToGreet<T extends LetterSeal>(
  letters: readonly T[],
  todayEpochDay: number,
  metIds: ReadonlySet<string>
): T | null {
  const due = letters
    .filter((letter) => letter.unlockEpochDay === todayEpochDay && !metIds.has(letter.id))
    .sort((a, b) => a.epochDay - b.epochDay || a.id.localeCompare(b.id));
  return due[0] ?? null;
}

export function isLetterSnoozed(nowMs: number = Date.now(), storage?: Storage): boolean {
  const s = resolveStorage(storage);
  if (!s) return false;
  try {
    const raw = s.getItem(LETTER_TILE_SNOOZE_STORAGE_KEY);
    if (!raw) return false;
    const until = Number(raw);
    return !Number.isNaN(until) && nowMs < until;
  } catch {
    return false;
  }
}

export function snoozeLetterTile(nowMs: number = Date.now(), storage?: Storage): void {
  const s = resolveStorage(storage);
  if (!s) return;
  try {
    s.setItem(LETTER_TILE_SNOOZE_STORAGE_KEY, String(nowMs + SNOOZE_DURATION_MS));
  } catch {
    // Ignore storage issues gracefully.
  }
}

/* clearLetterSnooze stays exported for its own test, and cross-checked in
   ready-letter-tile.test.ts (AU-09 test-only review). */
export function clearLetterSnooze(storage?: Storage): void {
  const s = resolveStorage(storage);
  if (!s) return;
  try {
    s.removeItem(LETTER_TILE_SNOOZE_STORAGE_KEY);
  } catch {
    // Ignore storage issues gracefully.
  }
}

/** Generic over the letter shape rather than taking `Letter`: the two days
    and the id are all these rules read, so a caller that never wants the
    bodies can pass seals and get seals back (letters.ts's
    `getLetterSeals`), and the letters screen still passes whole letters. */
export function unreadUnlockedLetters<T extends LetterSeal>(
  letters: readonly T[],
  todayEpochDay: number,
  readLetterIds?: Set<string> | readonly string[]
): T[] {
  const readSet =
    readLetterIds instanceof Set
      ? readLetterIds
      : Array.isArray(readLetterIds)
        ? new Set(readLetterIds)
        : getReadLetterIds();

  return letters
    .filter((letter) => !isLetterSealed(letter, todayEpochDay) && !readSet.has(letter.id))
    .sort((a, b) => a.unlockEpochDay - b.unlockEpochDay || a.epochDay - b.epochDay);
}
