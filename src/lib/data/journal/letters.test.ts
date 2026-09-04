/* The letters area (phase 4 ticket 19, CONTEXT: "Milestone", "Countdown",
   "Anniversary"). */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { journalWithBuiltIns, UUID_PATTERN } from './test-support.ts';

test('a letter round-trips its text and unlock day, and reads back newest first', async () => {
  const { journal } = await journalWithBuiltIns();
  const earlier = await journal.letters.addLetter({ epochDay: 100, text: 'dear future me', unlockEpochDay: 200 });
  const later = await journal.letters.addLetter({ epochDay: 102, text: 'one more for the road', unlockEpochDay: 400 });

  assert.match(later, UUID_PATTERN);
  const letters = await journal.letters.getLetters(10);
  assert.equal(letters.length, 2);
  assert.equal(letters[0].id, later);
  assert.equal(letters[1].id, earlier);
  assert.equal(letters[0].text, 'one more for the road');
  assert.equal(letters[0].epochDay, 102);
  assert.equal(letters[0].unlockEpochDay, 400);
});

test('blank text is refused before it ever reaches a screen', async () => {
  const { journal } = await journalWithBuiltIns();
  await assert.rejects(journal.letters.addLetter({ epochDay: 100, text: '   ', unlockEpochDay: 200 }));
});

test('a letter carries no mood, tags or dims, and writes no entry row', async () => {
  const { journal, db } = await journalWithBuiltIns();
  await journal.letters.addLetter({ epochDay: 100, text: 'sealed away', unlockEpochDay: 200 });

  const [letter] = await journal.letters.getLetters(10);
  for (const field of ['mood', 'tags', 'dims']) {
    assert.ok(!(field in letter), `a letter must not carry ${field}`);
  }

  const entries = await db.query<{ n: number }>('SELECT COUNT(*) AS n FROM entry');
  assert.equal(entries[0].n, 0, 'a letter is its own record type, not an Entry');
});

test('a single letter reads back by id, for a deep link that names one', async () => {
  const { journal } = await journalWithBuiltIns();
  const id = await journal.letters.addLetter({ epochDay: 100, text: 'just this one', unlockEpochDay: 200 });

  const letter = await journal.letters.getLetter(id);
  assert.equal(letter?.text, 'just this one');
  assert.equal(letter?.unlockEpochDay, 200);
});

test('a letter that is gone, or never was, reads back as null', async () => {
  const { journal } = await journalWithBuiltIns();
  const id = await journal.letters.addLetter({ epochDay: 100, text: 'temporary', unlockEpochDay: 200 });
  await journal.letters.deleteLetter(id);

  assert.equal(await journal.letters.getLetter(id), null);
  assert.equal(await journal.letters.getLetter('no-such-letter'), null);
});

test('deleting a letter is idempotent', async () => {
  const { journal } = await journalWithBuiltIns();
  const id = await journal.letters.addLetter({ epochDay: 100, text: 'goodbye for now', unlockEpochDay: 200 });

  await journal.letters.deleteLetter(id);
  await journal.letters.deleteLetter(id); // idempotent

  assert.deepEqual(await journal.letters.getLetters(10), []);
});

test('a letter seal carries the days and the id, and never the body', async () => {
  const { journal } = await journalWithBuiltIns();
  const earlier = await journal.letters.addLetter({ epochDay: 100, text: 'dear future me', unlockEpochDay: 200 });
  const later = await journal.letters.addLetter({ epochDay: 102, text: 'one more for the road', unlockEpochDay: 400 });

  const seals = await journal.letters.getLetterSeals(10);

  assert.deepEqual(seals, [
    { id: later, epochDay: 102, unlockEpochDay: 400 },
    { id: earlier, epochDay: 100, unlockEpochDay: 200 }
  ]);
  assert.equal((await journal.letters.getLetterSeals(1)).length, 1);
});
