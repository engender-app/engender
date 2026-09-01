/* The fluidity engine's presentation area (phase 5 deepening ticket 17,
   ADR-0048): no built-ins, no delete, and an MRU order that reads the entry
   table directly rather than a stored "last used" column. The MRU cases
   below insert an `entry` row by hand rather than through
   journal.entries.upsertEntry - this module's own ordering is what is under
   test, and entries.test.ts covers the write side of `presentation_id`. */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { journalWithBuiltIns, UUID_PATTERN } from './test-support.ts';

test('a new presentation gets a minted uuid, starts unhidden, and keeps the given colour', async () => {
  const { journal } = await journalWithBuiltIns();
  const created = await journal.presentations.addPresentation('femme', 2);
  assert.match(created.id, UUID_PATTERN);
  assert.deepEqual(created, { id: created.id, name: 'femme', roleIndex: 2, hidden: false });

  const stored = (await journal.presentations.getPresentations()).find((p) => p.id === created.id);
  assert.deepEqual(stored, created);
});

test('a fresh install has zero presentations', async () => {
  const { journal } = await journalWithBuiltIns();
  assert.deepEqual(await journal.presentations.getPresentations(), []);
});

test('renaming, recolouring and hiding address a presentation by its uuid', async () => {
  const { journal } = await journalWithBuiltIns();
  const created = await journal.presentations.addPresentation('femme', 0);

  await journal.presentations.renamePresentation(created.id, 'soft femme');
  await journal.presentations.setPresentationColour(created.id, 3);
  await journal.presentations.setPresentationHidden(created.id, true);

  const stored = (await journal.presentations.getPresentations()).find((p) => p.id === created.id);
  assert.deepEqual(stored, { id: created.id, name: 'soft femme', roleIndex: 3, hidden: true });
});

test('hiding a presentation leaves it addressable and does not remove it from the list', async () => {
  const { journal } = await journalWithBuiltIns();
  const created = await journal.presentations.addPresentation('femme', 0);
  await journal.presentations.setPresentationHidden(created.id, true);

  const stored = await journal.presentations.getPresentations();
  assert.equal(stored.length, 1);
  assert.equal(stored[0].hidden, true);
});

test('rename, recolour and hide throw on an unknown id', async () => {
  const { journal } = await journalWithBuiltIns();
  await assert.rejects(journal.presentations.renamePresentation('nope', 'x'), /unknown/);
  await assert.rejects(journal.presentations.setPresentationColour('nope', 1), /unknown/);
  await assert.rejects(journal.presentations.setPresentationHidden('nope', true), /unknown/);
});

/** Inserts a bare `entry` row carrying `presentationId` at `timestamp`,
    bypassing journal.entries entirely - only presentation_id and timestamp
    matter to the ordering under test. */
function plantEntry(db: Awaited<ReturnType<typeof journalWithBuiltIns>>['db'], presentationId: string, timestamp: number) {
  db.raw
    .prepare(
      "INSERT INTO entry (uuid, epoch_day, timestamp, note, presentation_id, updated_at) VALUES (?, ?, ?, '', ?, ?)"
    )
    .run(`e-${timestamp}`, 100, timestamp, presentationId, timestamp);
}

test('presentations come back most-recently-used first, never-used ones after in creation order', async () => {
  const { journal, db } = await journalWithBuiltIns();
  const early = await journal.presentations.addPresentation('early', 0);
  const late = await journal.presentations.addPresentation('late', 1);
  const neverUsed = await journal.presentations.addPresentation('never used', 2);

  plantEntry(db, early.id, 1000);
  plantEntry(db, late.id, 5000);

  const order = (await journal.presentations.getPresentations()).map((p) => p.id);
  assert.deepEqual(order, [late.id, early.id, neverUsed.id]);
});

test('a trashed entry does not count towards a presentation\'s last-used order', async () => {
  const { journal, db } = await journalWithBuiltIns();
  const stale = await journal.presentations.addPresentation('stale', 0);
  const fresh = await journal.presentations.addPresentation('fresh', 1);

  plantEntry(db, fresh.id, 2000);
  plantEntry(db, stale.id, 9000);
  db.raw.prepare("UPDATE entry SET trashed_at = ? WHERE presentation_id = ?").run(9500, stale.id);

  const order = (await journal.presentations.getPresentations()).map((p) => p.id);
  assert.deepEqual(order, [fresh.id, stale.id]);
});

test('the most recent of several entries decides a presentation\'s place, not the first', async () => {
  const { journal, db } = await journalWithBuiltIns();
  const a = await journal.presentations.addPresentation('a', 0);
  const b = await journal.presentations.addPresentation('b', 1);

  plantEntry(db, a.id, 1000);
  plantEntry(db, b.id, 2000);
  plantEntry(db, a.id, 3000);

  const order = (await journal.presentations.getPresentations()).map((p) => p.id);
  assert.deepEqual(order, [a.id, b.id]);
});
