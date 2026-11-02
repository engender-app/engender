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

   Live tile state (read resolution and 24h snooze) lives in the encrypted
   `acknowledgements` preference (ADR-0039, functional audit ticket 45), not
   in a table and no longer in plaintext localStorage. Every function that
   touches it takes the AcknowledgementStore to use. */

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

/** The letters whose arrival has already been met (ticket 45).

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
