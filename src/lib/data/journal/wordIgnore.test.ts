/* The word-frequency ignore list (phase 8 features ticket 48, ADR-0003).
   What is asked here is that the area is idempotent both ways, that it
   case-folds a word on write, and - the ticket's own driver-tier acceptance
   criterion - that adding a word to the list drops it from a subsequent
   `wordFrequency()` read over the same notes and removing it brings it
   back. The fold itself (composing with the per-note stopword layer) is
   wordFrequency.test.ts's own pure-function question; what is asked here is
   only that this area's rows are what a screen would actually pass it. */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { journalWithBuiltIns } from './test-support.ts';
import { analyseNotes, countWords } from '../wordFrequency.ts';

test('no word starts ignored', async () => {
  const { journal } = await journalWithBuiltIns();
  assert.deepEqual(await journal.wordIgnore.getIgnoredWords(), new Set());
});

test('ignoring and un-ignoring round-trips', async () => {
  const { journal } = await journalWithBuiltIns();

  await journal.wordIgnore.setWordIgnored('happy', true);
  assert.equal((await journal.wordIgnore.getIgnoredWords()).has('happy'), true);

  await journal.wordIgnore.setWordIgnored('happy', false);
  assert.equal((await journal.wordIgnore.getIgnoredWords()).has('happy'), false);
});

test('ignoring an already-ignored word changes nothing observable', async () => {
  const { journal } = await journalWithBuiltIns();
  await journal.wordIgnore.setWordIgnored('happy', true);
  await journal.wordIgnore.setWordIgnored('happy', true);
  assert.deepEqual(await journal.wordIgnore.getIgnoredWords(), new Set(['happy']));
});

test('un-ignoring a word nobody ignored is a no-op', async () => {
  const { journal } = await journalWithBuiltIns();
  await journal.wordIgnore.setWordIgnored('happy', false);
  assert.deepEqual(await journal.wordIgnore.getIgnoredWords(), new Set());
});

test('a word is case-folded the same way tokenize() folds a note', async () => {
  const { journal } = await journalWithBuiltIns();
  await journal.wordIgnore.setWordIgnored('Kraków', true);
  assert.deepEqual(await journal.wordIgnore.getIgnoredWords(), new Set(['kraków']));
  // The un-ignore has to fold the same way, or a word round-tripped through
  // the frequency list's own lowercase form could never remove it.
  await journal.wordIgnore.setWordIgnored('KRAKÓW', false);
  assert.deepEqual(await journal.wordIgnore.getIgnoredWords(), new Set());
});

test('two words ignore independently of each other', async () => {
  const { journal } = await journalWithBuiltIns();
  await journal.wordIgnore.setWordIgnored('happy', true);
  await journal.wordIgnore.setWordIgnored('sad', true);
  await journal.wordIgnore.setWordIgnored('happy', false);
  assert.deepEqual(await journal.wordIgnore.getIgnoredWords(), new Set(['sad']));
});

test('ignoring a word drops it from a subsequent count over the same notes, and un-ignoring brings it back', async () => {
  const { journal } = await journalWithBuiltIns();
  await journal.entries.upsertEntry({ epochDay: 20000, mood: 5, note: 'Marta felt happy today' });

  const countOf = async (word: string) => {
    const analysed = analyseNotes(await journal.entries.noteEntries());
    const ignored = await journal.wordIgnore.getIgnoredWords();
    return countWords(analysed, ignored).find(([w]) => w === word)?.[1] ?? 0;
  };

  assert.equal(await countOf('marta'), 1);

  await journal.wordIgnore.setWordIgnored('marta', true);
  assert.equal(await countOf('marta'), 0);

  await journal.wordIgnore.setWordIgnored('marta', false);
  assert.equal(await countOf('marta'), 1);
});
