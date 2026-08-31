/* Letters in the retrospective surfaces (phase 5 deepening ticket 13).

   One rule carries the whole file: a sealed letter is not a retrospective
   fact. Every function here answers for the seal exclusion itself rather
   than trusting its caller to apply it, and the tests below hold that rule
   case by case - a letter whose text is still sealed must come back from
   nothing here, whatever else about it matches. Rune-free and import-light,
   like on-this-day.test.ts. */
import { test, expect } from 'vitest';
import type { Letter } from './types.ts';
import { wrappedLetters, onThisDayLetters, featuredLetter, type RetrospectiveLetter } from './letterRetrospective.ts';

const letter = (over: Partial<Letter> & Pick<Letter, 'id' | 'epochDay' | 'unlockEpochDay'>): Letter => ({
  text: `letter ${over.id}`,
  ...over
});

/* Three letters the cases share: one unlocked from months ago, one still
   sealed, one that unlocked exactly on the day being asked about. */
const UNLOCKED = letter({ id: 'unlocked', epochDay: 100, unlockEpochDay: 150 });
const SEALED = letter({ id: 'sealed', epochDay: 110, unlockEpochDay: 9_000, text: 'still sealed' });
const OPENED_THAT_DAY = letter({ id: 'opened', epochDay: 200, unlockEpochDay: 400 });

test('wrappedLetters keeps the unlocked letters written inside the range', () => {
  const inRange = letter({ id: 'in', epochDay: 310, unlockEpochDay: 320 });
  const letters = wrappedLetters([inRange, UNLOCKED, SEALED], 300, 400, 500);

  expect(letters.map((l) => l.letter.id)).toEqual(['in']);
  expect(letters[0].kind).toBe('written');
});

test('wrappedLetters treats both range ends as inclusive', () => {
  const first = letter({ id: 'first', epochDay: 300, unlockEpochDay: 305 });
  const last = letter({ id: 'last', epochDay: 400, unlockEpochDay: 405 });
  const letters = wrappedLetters([last, first], 300, 400, 500);

  expect(letters.map((l) => l.letter.id)).toEqual(['first', 'last']);
});

test('wrappedLetters reads oldest first, whatever order the rows arrived in', () => {
  const a = letter({ id: 'a', epochDay: 310, unlockEpochDay: 320 });
  const b = letter({ id: 'b', epochDay: 320, unlockEpochDay: 330 });
  expect(wrappedLetters([b, a], 300, 400, 500).map((l) => l.letter.id)).toEqual(['a', 'b']);
});

test('wrappedLetters drops a letter written in the range but still sealed', () => {
  const sealedInRange = letter({ id: 'sealed-in-range', epochDay: 350, unlockEpochDay: 9_000, text: 'sealed' });
  expect(wrappedLetters([sealedInRange], 300, 400, 500)).toEqual([]);
});

test('onThisDayLetters matches a letter by the day it was written', () => {
  const writtenThatDay = letter({ id: 'written', epochDay: 400, unlockEpochDay: 500 });
  const letters = onThisDayLetters([writtenThatDay, UNLOCKED, SEALED], 400, 600);

  expect(letters.map((l) => l.letter.id)).toEqual(['written']);
  expect(letters[0].kind).toBe('written');
});

test('onThisDayLetters matches a letter by the day it unlocked', () => {
  const letters = onThisDayLetters([OPENED_THAT_DAY, UNLOCKED, SEALED], 400, 600);

  expect(letters.map((l) => l.letter.id)).toEqual(['opened']);
  expect(letters[0].kind).toBe('opened');
});

test('onThisDayLetters drops a letter sealed today even when its writing day matches', () => {
  const sealedWrittenThatDay = letter({ id: 'sealed', epochDay: 400, unlockEpochDay: 9_000, text: 'sealed' });
  expect(onThisDayLetters([sealedWrittenThatDay], 400, 600)).toEqual([]);
});

test('a letter written and unlocked on the same candidate day reads as written', () => {
  const both = letter({ id: 'both', epochDay: 400, unlockEpochDay: 400 });
  const letters = onThisDayLetters([both], 400, 600);

  expect(letters.map((l) => l.kind)).toEqual(['written']);
});

test('no matches is an empty list, the shape the screens already branch on', () => {
  expect(wrappedLetters([], 300, 400, 500)).toEqual<RetrospectiveLetter[]>([]);
  expect(onThisDayLetters([UNLOCKED], 999, 1_000)).toEqual<RetrospectiveLetter[]>([]);
});

test('featuredLetter is null with no letters, or when every letter is still sealed', () => {
  expect(featuredLetter([], 500)).toBeNull();
  expect(featuredLetter([SEALED], 500)).toBeNull();
});

test('featuredLetter picks the most recently unlocked letter', () => {
  const older = letter({ id: 'older', epochDay: 100, unlockEpochDay: 150 });
  const newer = letter({ id: 'newer', epochDay: 100, unlockEpochDay: 400 });
  expect(featuredLetter([older, newer, SEALED], 500)).toBe(newer);
});

test('featuredLetter breaks an unlock-day tie by whichever was written more recently', () => {
  const earlyWrite = letter({ id: 'early-write', epochDay: 100, unlockEpochDay: 300 });
  const lateWrite = letter({ id: 'late-write', epochDay: 200, unlockEpochDay: 300 });
  expect(featuredLetter([earlyWrite, lateWrite], 500)).toBe(lateWrite);
});

test('featuredLetter never returns a still-sealed letter, however recent', () => {
  const justSealed = letter({ id: 'just-sealed', epochDay: 490, unlockEpochDay: 501 });
  expect(featuredLetter([justSealed, UNLOCKED], 500)).toBe(UNLOCKED);
});
