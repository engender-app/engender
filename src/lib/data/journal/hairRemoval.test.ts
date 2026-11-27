import assert from 'node:assert/strict';
import { test } from 'vitest';
import { fakeFileStore } from '../photos/test-support/fake-file-store.ts';
import { migratedDb } from '../sqlite/test-support/migrated-db.ts';
import { openJournal } from './journal.ts';

test('deleting a hair-removal session removes its photos and files immediately, preserving other sessions', async () => {
  const db = await migratedDb();
  const files = fakeFileStore();
  const journal = openJournal(db, files);
  const input = { epochDay: 20000, area: 'chin' as const, method: 'laser' as const, painRating: 2 };
  const removed = await journal.hairRemoval.upsertSession(input);
  const kept = await journal.hairRemoval.upsertSession({ ...input, epochDay: 20001 });
  const photo = { full: new Uint8Array([1, 2]), thumb: new Uint8Array([3]) };
  await journal.hairRemoval.addPhoto(kept, photo);
  const keptFiles = files.names();
  await journal.hairRemoval.addPhoto(removed, photo);
  await journal.hairRemoval.addPhoto(removed, photo);
  assert.equal(files.names().length, 6);
  assert.equal((await db.query('PRAGMA foreign_keys'))[0].foreign_keys, 1);

  await journal.hairRemoval.deleteSession(removed);
  await journal.hairRemoval.deleteSession(removed);

  assert.deepEqual(await journal.hairRemoval.getPhotos(removed), []);
  assert.equal((await journal.hairRemoval.getPhotos(kept)).length, 1);
  assert.deepEqual(files.names(), keptFiles);
  assert.deepEqual((await journal.archive.snapshot()).files.map((file) => file.name).sort(), keptFiles);
  assert.deepEqual(await db.query('PRAGMA foreign_key_check'), []);
});

/* pain is optional (an unrated session stores no rating, not 3), a session can carry its
   length in minutes, and four areas are new. */
async function open() {
  const db = await migratedDb();
  return { db, journal: openJournal(db, fakeFileStore()) };
}

test('a session saved without a pain rating stores none, and a rating still stores as given', async () => {
  const { db, journal } = await open();
  const unrated = await journal.hairRemoval.upsertSession({ epochDay: 20000, area: 'chin', method: 'laser' });
  const rated = await journal.hairRemoval.upsertSession({ epochDay: 20001, area: 'chin', method: 'laser', painRating: 4 });

  const sessions = await journal.hairRemoval.getSessions();
  assert.equal(sessions.find((s) => s.id === unrated)?.painRating, null);
  assert.equal(sessions.find((s) => s.id === rated)?.painRating, 4);
  assert.deepEqual(await db.query('SELECT pain_rating FROM hair_removal_session ORDER BY id'), [
    { pain_rating: null },
    { pain_rating: 4 }
  ]);

  // Clearing a rating on edit stores none too; an explicit null is the same as leaving it out.
  await journal.hairRemoval.upsertSession({ id: rated, epochDay: 20001, area: 'chin', method: 'laser', painRating: null });
  assert.equal((await journal.hairRemoval.getSessionsOnDay(20001))[0].painRating, null);
});

test('a rating outside 1 to 5 is still refused', async () => {
  const { journal } = await open();
  for (const painRating of [0, 6, 2.5]) {
    await assert.rejects(
      journal.hairRemoval.upsertSession({ epochDay: 1, area: 'chin', method: 'laser', painRating }),
      /invalid pain rating/
    );
  }
});

test('session minutes are stored and read back, and none is stored as none', async () => {
  const { journal } = await open();
  const timed = await journal.hairRemoval.upsertSession({ epochDay: 20000, area: 'chin', method: 'electrolysis', minutes: 90 });
  const untimed = await journal.hairRemoval.upsertSession({ epochDay: 20001, area: 'chin', method: 'electrolysis' });

  const sessions = await journal.hairRemoval.getSessions();
  assert.equal(sessions.find((s) => s.id === timed)?.minutes, 90);
  assert.equal(sessions.find((s) => s.id === untimed)?.minutes, null);
});

test('minutes must be a whole number from 1 to 1440', async () => {
  const { journal } = await open();
  for (const minutes of [0, -5, 1441, 12.5, Number.NaN]) {
    await assert.rejects(
      journal.hairRemoval.upsertSession({ epochDay: 1, area: 'chin', method: 'laser', minutes }),
      /invalid session minutes/
    );
  }
});

test('cheeks, jawline, sideburns and a genital or surgical-site area can be logged', async () => {
  const { journal } = await open();
  const areas = ['cheeks', 'jawline', 'sideburns', 'genital_surgical_site'] as const;
  for (const [i, area] of areas.entries()) {
    await journal.hairRemoval.upsertSession({ epochDay: 20000 + i, area, method: 'electrolysis' });
  }
  assert.deepEqual((await journal.hairRemoval.getSessions()).map((s) => s.area), [...areas]);
});

test('minutes and a missing rating survive export and import, and an older archive reads minutes as none', async () => {
  const { journal } = await open();
  await journal.hairRemoval.upsertSession({ epochDay: 20000, area: 'sideburns', method: 'electrolysis', minutes: 60 });
  const { journal: exported } = await journal.archive.snapshot();
  assert.equal(exported.hairRemovalSessions[0].minutes, 60);
  assert.equal(exported.hairRemovalSessions[0].painRating, null);

  const target = await open();
  await target.journal.archive.replace({ journal: exported, files: (async function* () {})() });
  const [restored] = await target.journal.hairRemoval.getSessions();
  assert.equal(restored.minutes, 60);
  assert.equal(restored.painRating, null);

  const older = {
    ...exported,
    hairRemovalSessions: exported.hairRemovalSessions.map(({ minutes: _minutes, ...rest }) => rest)
  } as typeof exported;
  const fromOlder = await open();
  await fromOlder.journal.archive.replace({ journal: older, files: (async function* () {})() });
  assert.equal((await fromOlder.journal.hairRemoval.getSessions())[0].minutes, null);
});

test('the body-map inspector finds the new areas under the regions they sit on', async () => {
  const { linkedHairRemovalAreasForRegion } = await import('./bodyMapQueries.ts');
  const face = linkedHairRemovalAreasForRegion('face_jaw');
  for (const area of ['cheeks', 'jawline', 'sideburns']) assert.ok(face.includes(area), area);
  assert.ok(linkedHairRemovalAreasForRegion('genitals').includes('genital_surgical_site'));
});
