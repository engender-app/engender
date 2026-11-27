/* A letter unlocks when the supplied local day reaches unlockEpochDay
   (ADR-0001). Resolve that state on read (ADR-0010). Read and write tile
   acknowledgements and 24h snoozes through the encrypted AcknowledgementStore
   (ADR-0039). */

import { isSealedUntil } from './sealedUntil';
import { isTileSnoozed, snoozeTile, clearSnooze } from './liveTilesSnooze';
import { withLetterGreeted, withLetterRead, type AcknowledgementStore } from './acknowledgements';
import type { LetterSeal } from './journal/letters';
import type { Letter } from './types';

export function isLetterSealed(letter: Pick<Letter, 'unlockEpochDay'>, todayEpochDay: number): boolean {
  return isSealedUntil(letter.unlockEpochDay, todayEpochDay);
}

/* getReadLetterIds stays exported for its own test, and cross-checked in
   ready-letter-tile.test.ts (AU-09 test-only review). */
export function getReadLetterIds(store: AcknowledgementStore): Set<string> {
  return new Set(store.read().readLetterIds);
}

export function markLetterRead(letterId: string, store: AcknowledgementStore): void {
  const current = store.read();
  const next = withLetterRead(current, letterId);
  if (next !== current) store.write(next);
}

/** The letters whose arrival has already been met.

    A separate set from the read one, because the two facts differ: a person
    can be shown a letter's arrival and choose to leave it closed, and that
    letter is met but unread - the live tile on Today still has something to
    say about it, and the arrival does not. */
export function getGreetedLetterIds(store: AcknowledgementStore): Set<string> {
  return new Set(store.read().greetedLetterIds);
}

export function markLetterGreeted(letterId: string, store: AcknowledgementStore): void {
  const current = store.read();
  const next = withLetterGreeted(current, letterId);
  if (next !== current) store.write(next);
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

export function isLetterSnoozed(store: AcknowledgementStore, nowMs: number = Date.now()): boolean {
  return isTileSnoozed('ready-letter', store, nowMs);
}

export function snoozeLetterTile(store: AcknowledgementStore, nowMs: number = Date.now()): void {
  snoozeTile('ready-letter', store, undefined, nowMs);
}

export function clearLetterSnooze(store: AcknowledgementStore): void {
  clearSnooze('ready-letter', store);
}

/** Generic over the letter shape rather than taking `Letter`: the two days
    and the id are all these rules read, so a caller that never wants the
    bodies can pass seals and get seals back (letters.ts's
    `getLetterSeals`), and the letters screen still passes whole letters. */
export function unreadUnlockedLetters<T extends LetterSeal>(
  letters: readonly T[],
  todayEpochDay: number,
  readLetterIds: Set<string> | readonly string[]
): T[] {
  const readSet = readLetterIds instanceof Set ? readLetterIds : new Set(readLetterIds);

  return letters
    .filter((letter) => !isLetterSealed(letter, todayEpochDay) && !readSet.has(letter.id))
    .sort((a, b) => a.unlockEpochDay - b.unlockEpochDay || a.epochDay - b.epochDay);
}
