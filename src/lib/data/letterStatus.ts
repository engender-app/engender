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
import type { Letter } from './types';

export const LETTER_TILE_SNOOZE_STORAGE_KEY = 'letter_tile_snooze_until';
export const READ_LETTERS_STORAGE_KEY = 'gender-diary-read-letter-ids';
export const SNOOZE_DURATION_MS = 24 * 60 * 60 * 1000;

function resolveStorage(storage?: Storage): Storage | null {
  if (storage) return storage;
  if (typeof localStorage !== 'undefined') return localStorage;
  return null;
}

export function isLetterSealed(letter: Pick<Letter, 'unlockEpochDay'>, todayEpochDay: number): boolean {
  return isSealedUntil(letter.unlockEpochDay, todayEpochDay);
}

export function getReadLetterIds(storage?: Storage): Set<string> {
  const s = resolveStorage(storage);
  if (!s) return new Set();
  try {
    const raw = s.getItem(READ_LETTERS_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed.map(String)) : new Set();
  } catch {
    return new Set();
  }
}

export function markLetterRead(letterId: string, storage?: Storage): void {
  const s = resolveStorage(storage);
  if (!s) return;
  const current = getReadLetterIds(s);
  current.add(letterId);
  try {
    s.setItem(READ_LETTERS_STORAGE_KEY, JSON.stringify(Array.from(current)));
  } catch {
    // Storage quota or disabled storage is ignored gracefully.
  }
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

export function clearLetterSnooze(storage?: Storage): void {
  const s = resolveStorage(storage);
  if (!s) return;
  try {
    s.removeItem(LETTER_TILE_SNOOZE_STORAGE_KEY);
  } catch {
    // Ignore storage issues gracefully.
  }
}

export function unreadUnlockedLetters(
  letters: Letter[],
  todayEpochDay: number,
  readLetterIds?: Set<string> | readonly string[]
): Letter[] {
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
