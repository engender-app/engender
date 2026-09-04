/* Letters in the retrospective surfaces (phase 5 deepening ticket 13).

   One rule carries the whole file: a sealed letter is not a retrospective
   fact. Every function here answers for the seal exclusion itself rather
   than trusting its caller to apply it, and the tests below hold that rule
   case by case - a letter whose text is still sealed must come back from
   nothing here, whatever else about it matches. Rune-free and import-light,
   like on-this-day.test.ts. */
import { test, expect } from 'vitest';
import type { Letter } from './types.ts';
import {
  wrappedLetters,
  onThisDayLetters,
  safeSpaceLetters,
  letterOpening,
  type RetrospectiveLetter
} from './letterRetrospective.ts';

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

test('safeSpaceLetters is empty with no letters, or when every letter is still sealed', () => {
  expect(safeSpaceLetters([], 500)).toEqual<Letter[]>([]);
  expect(safeSpaceLetters([SEALED], 500)).toEqual<Letter[]>([]);
});

test('safeSpaceLetters returns every unlocked letter, most recently unlocked first', () => {
  const older = letter({ id: 'older', epochDay: 100, unlockEpochDay: 150 });
  const newer = letter({ id: 'newer', epochDay: 100, unlockEpochDay: 400 });
  const middle = letter({ id: 'middle', epochDay: 100, unlockEpochDay: 300 });

  expect(safeSpaceLetters([older, newer, middle, SEALED], 500).map((l) => l.id)).toEqual([
    'newer',
    'middle',
    'older'
  ]);
});

test('safeSpaceLetters breaks an unlock-day tie by whichever was written more recently, then by id', () => {
  const earlyWrite = letter({ id: 'early-write', epochDay: 100, unlockEpochDay: 300 });
  const lateWrite = letter({ id: 'late-write', epochDay: 200, unlockEpochDay: 300 });
  const sameDay = letter({ id: 'zz-same-day', epochDay: 200, unlockEpochDay: 300 });

  expect(safeSpaceLetters([earlyWrite, lateWrite, sameDay], 500).map((l) => l.id)).toEqual([
    'zz-same-day',
    'late-write',
    'early-write'
  ]);
});

test('safeSpaceLetters never returns a still-sealed letter, however recent', () => {
  const justSealed = letter({ id: 'just-sealed', epochDay: 490, unlockEpochDay: 501 });
  expect(safeSpaceLetters([justSealed, UNLOCKED], 500).map((l) => l.id)).toEqual(['unlocked']);
});

test('safeSpaceLetters leaves the caller its own array to slice, and does not reorder theirs', () => {
  const older = letter({ id: 'older', epochDay: 100, unlockEpochDay: 150 });
  const newer = letter({ id: 'newer', epochDay: 100, unlockEpochDay: 400 });
  const given = [older, newer];

  safeSpaceLetters(given, 500);
  expect(given.map((l) => l.id)).toEqual(['older', 'newer']);
});

/* letterOpening: what a row may carry of a letter. The row's own two-line
   clamp is CSS, which cuts the paint and not the text, so a row whose
   subtitle is the whole letter announces the whole letter to a screen
   reader - three of them in a row on Safe Space, before the reader has
   chosen anything. This is the code-side cut that stops that. */

test('letterOpening leaves a short letter exactly as written', () => {
  expect(letterOpening('The haircut was the right call.', 200)).toBe('The haircut was the right call.');
});

test('letterOpening flattens the paragraphs a row cannot show anyway', () => {
  expect(letterOpening('One line.\n\nAnd another.\n  Indented.', 200)).toBe('One line. And another. Indented.');
});

test('letterOpening cuts a long letter on a word boundary and says it was cut', () => {
  const opening = letterOpening('alpha bravo charlie delta echo foxtrot', 20);

  expect(opening).toBe('alpha bravo charlie\u2026');
  expect(opening.length).toBeLessThanOrEqual(21);
});

test('letterOpening cuts mid-word only where a word is longer than the whole allowance', () => {
  expect(letterOpening('supercalifragilisticexpialidocious', 10)).toBe('supercalif\u2026');
});

test('letterOpening keeps a letter that lands exactly on the limit whole', () => {
  expect(letterOpening('12345', 5)).toBe('12345');
});

test('letterOpening on an empty letter is empty, not an ellipsis', () => {
  expect(letterOpening('   ', 200)).toBe('');
});
