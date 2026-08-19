/* Tryouts (phase 4 ticket 16, widened past name/pronoun by phase 5 ticket
   13, CONTEXT: "Tryout", "Felt-sense entry"). */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { fakeFileStore } from '../photos/test-support/fake-file-store.ts';
import { thumbFileName } from '../photos/names.ts';
import { migratedDb } from '../sqlite/test-support/migrated-db.ts';
import { openJournal } from './journal.ts';
import { sweepOrphanPhotos } from './photos.ts';
import { journalWithBuiltIns, UUID_PATTERN } from './test-support.ts';

const shot = (full: string, thumb: string) => ({
  full: new Uint8Array([...full].map((c) => c.charCodeAt(0))),
  thumb: new Uint8Array([...thumb].map((c) => c.charCodeAt(0)))
});

async function journalWithFiles() {
  const db = await migratedDb();
  const files = fakeFileStore();
  const journal = openJournal(db, files);
  await journal.reconcileBuiltIns();
  return { db, files, journal };
}

test('a tryout round-trips its fields, and reads back most recently started first', async () => {
  const { journal } = await journalWithBuiltIns();
  const earlier = await journal.tryouts.upsertTryout({
    kind: 'pronouns',
    label: 'she/her',
    startEpochDay: 100,
    endEpochDay: null
  });
  const later = await journal.tryouts.upsertTryout({
    kind: 'name',
    label: 'Alex',
    startEpochDay: 102,
    endEpochDay: null
  });

  assert.match(later, UUID_PATTERN);
  const tryouts = await journal.tryouts.getTryouts();
  assert.equal(tryouts.length, 2);
  assert.deepEqual(tryouts[0], {
    id: later,
    kind: 'name',
    label: 'Alex',
    description: null,
    startEpochDay: 102,
    endEpochDay: null
  });
  assert.deepEqual(tryouts[1], {
    id: earlier,
    kind: 'pronouns',
    label: 'she/her',
    description: null,
    startEpochDay: 100,
    endEpochDay: null
  });
});

test('several tryouts can overlap, and none of them is assumed current', async () => {
  const { journal } = await journalWithBuiltIns();
  await journal.tryouts.upsertTryout({ kind: 'name', label: 'Alex', startEpochDay: 100, endEpochDay: null });
  await journal.tryouts.upsertTryout({ kind: 'pronouns', label: 'she/her', startEpochDay: 100, endEpochDay: null });

  const tryouts = await journal.tryouts.getTryouts();
  assert.equal(tryouts.length, 2);
  for (const field of ['current', 'isCurrent', 'active']) {
    assert.ok(!(field in tryouts[0]), `a tryout must not carry ${field}`);
  }
});

test('blank text is refused before it ever reaches a screen', async () => {
  const { journal } = await journalWithBuiltIns();
  await assert.rejects(
    journal.tryouts.upsertTryout({ kind: 'name', label: '   ', startEpochDay: 100, endEpochDay: null })
  );
});

test('a tryout updates by id, and closing it out sets an end day', async () => {
  const { journal } = await journalWithBuiltIns();
  const id = await journal.tryouts.upsertTryout({ kind: 'name', label: 'Alex', startEpochDay: 100, endEpochDay: null });

  await journal.tryouts.upsertTryout({ id, kind: 'name', label: 'Alexis', startEpochDay: 100, endEpochDay: 150 });

  assert.deepEqual(await journal.tryouts.getTryouts(), [
    { id, kind: 'name', label: 'Alexis', description: null, startEpochDay: 100, endEpochDay: 150 }
  ]);

  await assert.rejects(
    journal.tryouts.upsertTryout({ id: 'nope', kind: 'name', label: 'x', startEpochDay: 1, endEpochDay: null }),
    /unknown tryout/
  );
});

test('deleting a tryout is idempotent and takes its felt-sense history with it', async () => {
  const { journal, db } = await journalWithBuiltIns();
  const id = await journal.tryouts.upsertTryout({ kind: 'name', label: 'Alex', startEpochDay: 100, endEpochDay: null });
  await journal.tryouts.addFeltSenseEntry({ tryoutId: id, epochDay: 100, mood: 4 });

  await journal.tryouts.deleteTryout(id);
  await journal.tryouts.deleteTryout(id); // idempotent

  assert.deepEqual(await journal.tryouts.getTryouts(), []);
  const rows = await db.query<{ n: number }>('SELECT COUNT(*) AS n FROM tryout_felt_sense');
  assert.equal(rows[0].n, 0);
});

test('a felt-sense entry round-trips its mood and note, newest first', async () => {
  const { journal } = await journalWithBuiltIns();
  const id = await journal.tryouts.upsertTryout({ kind: 'name', label: 'Alex', startEpochDay: 100, endEpochDay: null });

  const earlier = await journal.tryouts.addFeltSenseEntry({ tryoutId: id, epochDay: 100, mood: 2, note: 'awkward' });
  const later = await journal.tryouts.addFeltSenseEntry({ tryoutId: id, epochDay: 110, mood: 4 });

  assert.match(later, UUID_PATTERN);
  const history = await journal.tryouts.getFeltSenseEntries(id);
  assert.deepEqual(history, [
    { id: later, tryoutId: id, epochDay: 110, mood: 4, note: null },
    { id: earlier, tryoutId: id, epochDay: 100, mood: 2, note: 'awkward' }
  ]);
});

test('a tryout can carry more than one felt-sense observation over its lifespan', async () => {
  const { journal } = await journalWithBuiltIns();
  const id = await journal.tryouts.upsertTryout({ kind: 'pronouns', label: 'they/them', startEpochDay: 100, endEpochDay: null });

  await journal.tryouts.addFeltSenseEntry({ tryoutId: id, epochDay: 100, mood: 3 });
  await journal.tryouts.addFeltSenseEntry({ tryoutId: id, epochDay: 120, mood: 4 });
  await journal.tryouts.addFeltSenseEntry({ tryoutId: id, epochDay: 140, mood: 5 });

  assert.equal((await journal.tryouts.getFeltSenseEntries(id)).length, 3);
});

test('an unknown tryout and an out-of-range mood are refused before either reaches the schema', async () => {
  const { journal } = await journalWithBuiltIns();
  const id = await journal.tryouts.upsertTryout({ kind: 'name', label: 'Alex', startEpochDay: 100, endEpochDay: null });

  await assert.rejects(journal.tryouts.addFeltSenseEntry({ tryoutId: 'nope', epochDay: 100, mood: 3 }));
  await assert.rejects(journal.tryouts.addFeltSenseEntry({ tryoutId: id, epochDay: 100, mood: 0 }), /invalid mood/);
  await assert.rejects(journal.tryouts.addFeltSenseEntry({ tryoutId: id, epochDay: 100, mood: 6 }), /invalid mood/);
});

test('deleting a felt-sense entry is idempotent and leaves the tryout and its other entries alone', async () => {
  const { journal } = await journalWithBuiltIns();
  const id = await journal.tryouts.upsertTryout({ kind: 'name', label: 'Alex', startEpochDay: 100, endEpochDay: null });
  const gone = await journal.tryouts.addFeltSenseEntry({ tryoutId: id, epochDay: 100, mood: 2 });
  const kept = await journal.tryouts.addFeltSenseEntry({ tryoutId: id, epochDay: 110, mood: 4 });

  await journal.tryouts.deleteFeltSenseEntry(gone);
  await journal.tryouts.deleteFeltSenseEntry(gone); // idempotent

  assert.deepEqual(
    (await journal.tryouts.getFeltSenseEntries(id)).map((e) => e.id),
    [kept]
  );
  assert.equal((await journal.tryouts.getTryouts()).length, 1);
});

test('entries in a tryout\'s date range are read by date overlap, not a stored link', async () => {
  const { journal, db } = await journalWithBuiltIns();
  const id = await journal.tryouts.upsertTryout({ kind: 'name', label: 'Alex', startEpochDay: 100, endEpochDay: 110 });
  await journal.entries.upsertEntry({ epochDay: 90, mood: 3 }); // before
  await journal.entries.upsertEntry({ epochDay: 105, mood: 4 }); // inside
  await journal.entries.upsertEntry({ epochDay: 120, mood: 2 }); // after

  const tryout = (await journal.tryouts.getTryouts()).find((t) => t.id === id)!;
  const inRange = await journal.entries.searchEntries('', [], {
    startEpochDay: tryout.startEpochDay,
    endEpochDay: tryout.endEpochDay
  });

  assert.deepEqual(inRange.map((e) => e.epochDay), [105]);

  const linkColumns = await db.query<{ name: string }>("PRAGMA table_info('entry')");
  assert.ok(
    !linkColumns.some((c) => c.name.includes('tryout')),
    'an entry carries no tryout reference of its own'
  );
});

/* Phase 5 ticket 13: `kind` widens past name/pronoun, and a non-name/pronoun
   tryout carries a free-text description alongside its label. */

test('a tryout can be any of the widened kinds, each with its own free-text description', async () => {
  const { journal } = await journalWithBuiltIns();

  for (const kind of ['name', 'pronouns', 'style', 'garment', 'makeup', 'presentation_step'] as const) {
    const id = await journal.tryouts.upsertTryout({
      kind,
      label: `trying ${kind}`,
      description: kind === 'name' ? null : `notes about the ${kind}`,
      startEpochDay: 100,
      endEpochDay: null
    });
    const [tryout] = (await journal.tryouts.getTryouts()).filter((t) => t.id === id);
    assert.equal(tryout.kind, kind);
    assert.equal(tryout.description, kind === 'name' ? null : `notes about the ${kind}`);
  }
});

test('a blank description is stored as null, the same as an absent one', async () => {
  const { journal } = await journalWithBuiltIns();
  const id = await journal.tryouts.upsertTryout({
    kind: 'style',
    label: 'layered look',
    description: '   ',
    startEpochDay: 100,
    endEpochDay: null
  });

  const [tryout] = await journal.tryouts.getTryouts();
  assert.equal(tryout.id, id);
  assert.equal(tryout.description, null);
});

/* Phase 5 ticket 13: photos, through the same pipeline procedures.ts's
   recovery photos use. */

test('a tryout photo round-trips through the same pipeline procedures use, oldest first', async () => {
  const { files, journal } = await journalWithFiles();
  const id = await journal.tryouts.upsertTryout({ kind: 'style', label: 'layered look', startEpochDay: 100, endEpochDay: null });

  const first = await journal.tryouts.addPhoto(id, 100, shot('a', 'A'));
  const second = await journal.tryouts.addPhoto(id, 110, shot('b', 'B'));

  const photos = await journal.tryouts.getPhotos(id);
  assert.deepEqual(
    photos.map((p) => p.id),
    [first, second]
  );
  assert.equal(photos[0].fileName, `${first}.jpg`);
  // files.names() sorts by name, not insertion order, so compared as a set.
  assert.deepEqual(
    files.names(),
    [`${first}-thumb.jpg`, `${first}.jpg`, `${second}-thumb.jpg`, `${second}.jpg`].sort()
  );
  assert.deepEqual(await files.read(`${first}.jpg`), shot('a', 'A').full);
});

test('addPhoto throws on an unknown tryout, before any file lands', async () => {
  const { files, journal } = await journalWithFiles();
  await assert.rejects(journal.tryouts.addPhoto('nope', 100, shot('x', 'X')));
  assert.deepEqual(files.names(), []);
});

test('removing a tryout photo drops the row and both its files, idempotently', async () => {
  const { files, journal } = await journalWithFiles();
  const id = await journal.tryouts.upsertTryout({ kind: 'style', label: 'layered look', startEpochDay: 100, endEpochDay: null });
  const photoId = await journal.tryouts.addPhoto(id, 100, shot('r', 'R'));

  await journal.tryouts.deletePhoto(photoId);
  await journal.tryouts.deletePhoto(photoId); // idempotent

  assert.deepEqual(files.names(), []);
  assert.deepEqual(await journal.tryouts.getPhotos(id), []);
});

test('deleting a tryout takes its photo files and their thumbnails with it, alongside its felt-sense history', async () => {
  const { db, files, journal } = await journalWithFiles();
  const id = await journal.tryouts.upsertTryout({ kind: 'style', label: 'layered look', startEpochDay: 100, endEpochDay: null });
  await journal.tryouts.addFeltSenseEntry({ tryoutId: id, epochDay: 100, mood: 3 });
  await journal.tryouts.addPhoto(id, 100, shot('d', 'D'));

  await journal.tryouts.deleteTryout(id);
  await journal.tryouts.deleteTryout(id); // idempotent

  assert.deepEqual(files.names(), []);
  const rows = await db.query<{ n: number }>('SELECT COUNT(*) AS n FROM tryout_photo');
  assert.equal(rows[0].n, 0);
});

test('the sweep leaves a referenced tryout photo alone and reclaims an orphaned one', async () => {
  const { db, files, journal } = await journalWithFiles();
  const id = await journal.tryouts.upsertTryout({ kind: 'style', label: 'layered look', startEpochDay: 100, endEpochDay: null });
  const kept = await journal.tryouts.addPhoto(id, 100, shot('k', 'K'));
  await files.write('99999999-dead-4000-8000-000000000000.jpg', new Uint8Array([9]));

  await sweepOrphanPhotos(db, files);

  assert.deepEqual(files.names(), [`${kept}-thumb.jpg`, `${kept}.jpg`]);
  assert.ok(files.names().includes(thumbFileName(`${kept}.jpg`)));
});
