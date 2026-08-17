/* The tally area (phase 4 ticket 10, CONTEXT: "Tally event"): a misgendering
   or correct-gendering tap, its own record type, not an Entry or a quick log. */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { journalWithBuiltIns, UUID_PATTERN } from './test-support.ts';

test('a tally event round-trips with its context, and reads back oldest first', async () => {
  const { journal } = await journalWithBuiltIns();
  const later = await journal.tally.log({ epochDay: 102, kind: 'misgendered', context: 'at the pharmacy' });
  const earlier = await journal.tally.log({ epochDay: 100, kind: 'misgendered' });

  assert.match(later, UUID_PATTERN);
  const events = await journal.tally.getEvents('misgendered');
  assert.deepEqual(events, [
    { id: earlier, epochDay: 100, kind: 'misgendered', context: '' },
    { id: later, epochDay: 102, kind: 'misgendered', context: 'at the pharmacy' }
  ]);
});

test('the two kinds are tracked apart, never combined', async () => {
  const { journal } = await journalWithBuiltIns();
  await journal.tally.log({ epochDay: 100, kind: 'misgendered' });
  await journal.tally.log({ epochDay: 100, kind: 'correctly_gendered' });
  await journal.tally.log({ epochDay: 100, kind: 'correctly_gendered' });

  assert.equal((await journal.tally.getEvents('misgendered')).length, 1);
  assert.equal((await journal.tally.getEvents('correctly_gendered')).length, 2);
});

test('a tally event carries no mood, dimension values, tags or note, and writes no entry row', async () => {
  const { journal, db } = await journalWithBuiltIns();
  await journal.tally.log({ epochDay: 100, kind: 'misgendered', context: 'note to self' });

  const [event] = await journal.tally.getEvents('misgendered');
  for (const field of ['mood', 'note', 'tags', 'dims']) {
    assert.ok(!(field in event), `a tally event must not carry ${field}`);
  }

  const entries = await db.query<{ n: number }>('SELECT COUNT(*) AS n FROM entry');
  assert.equal(entries[0].n, 0, 'a tally event is its own record type, not an Entry');
});

test('an unknown kind is refused by the schema before it ever reaches a screen', async () => {
  const { journal } = await journalWithBuiltIns();
  await assert.rejects(journal.tally.log({ epochDay: 100, kind: 'confused' as never }));
});

test('context can be attached after the tap, since the one-tap log must not wait on it', async () => {
  const { journal } = await journalWithBuiltIns();
  const id = await journal.tally.log({ epochDay: 100, kind: 'misgendered' });

  await journal.tally.setContext(id, 'at the pharmacy');

  assert.deepEqual(await journal.tally.getEvents('misgendered'), [
    { id, epochDay: 100, kind: 'misgendered', context: 'at the pharmacy' }
  ]);
  await assert.rejects(journal.tally.setContext('nope', 'x'), /unknown tally/);
});

test('deleting a tally event is idempotent', async () => {
  const { journal } = await journalWithBuiltIns();
  const id = await journal.tally.log({ epochDay: 100, kind: 'misgendered' });

  await journal.tally.deleteEvent(id);
  await journal.tally.deleteEvent(id); // idempotent

  assert.deepEqual(await journal.tally.getEvents('misgendered'), []);
});
