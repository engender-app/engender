/* The counter the update guard reads (ticket 04). Part of the Node tier; run
   with `npm test`. */

import assert from 'node:assert/strict';
import { test } from 'vitest';
import { markJournalBusy, onJournalBusyChange, journalIsBusy } from './journal-busy.ts';

test('nothing in flight until something enters', () => {
  assert.equal(journalIsBusy(), false);
});

test('a write holds the flag until it releases', () => {
  const done = markJournalBusy();
  assert.equal(journalIsBusy(), true);
  done();
  assert.equal(journalIsBusy(), false);
});

test('overlapping writes both have to finish', () => {
  // Two saves in flight at once is ordinary: the entry editor's save and the
  // photo store's write land on their own schedules. The flag has to survive
  // the first one finishing, or an update would land on the second.
  const first = markJournalBusy();
  const second = markJournalBusy();

  first();
  assert.equal(journalIsBusy(), true);
  second();
  assert.equal(journalIsBusy(), false);
});

test('releasing twice does not open the door early', () => {
  const first = markJournalBusy();
  const second = markJournalBusy();

  first();
  first();

  assert.equal(journalIsBusy(), true);
  second();
  assert.equal(journalIsBusy(), false);
});

test('listeners hear the edges and not the writes between them', () => {
  const heard: boolean[] = [];
  const stop = onJournalBusyChange((busy) => heard.push(busy));

  const first = markJournalBusy();
  const second = markJournalBusy();
  first();
  second();

  // Two edges, not four: what a listener acts on is whether the journal is
  // busy, and the second overlapping write does not change that answer.
  assert.deepEqual(heard, [true, false]);
  stop();
});

test('a stopped listener hears nothing further', () => {
  const heard: boolean[] = [];
  const stop = onJournalBusyChange((busy) => heard.push(busy));
  stop();

  markJournalBusy()();

  assert.deepEqual(heard, []);
});
