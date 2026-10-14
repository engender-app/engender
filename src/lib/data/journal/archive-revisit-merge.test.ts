import assert from 'node:assert/strict';
import { test, vi } from 'vitest';
import { CorruptArchiveError, collect } from '../archive/container.ts';
import { archiveFailureKind } from '../archive/failure.ts';
import { openArchive, packArchive } from '../archive/pack.ts';
import { portablePreferences } from '../archive/payload.ts';
import { thumbFileName } from '../photos/names.ts';
import { fakeFileStore } from '../photos/test-support/fake-file-store.ts';
import { PREFERENCE_DEFAULTS } from '../prefs/catalogue.ts';
import { migratedDb } from '../sqlite/test-support/migrated-db.ts';
import { CHEAP_KDF, oneShot } from './golden-archive-fixture.ts';
import { openJournal } from './journal.ts';
import { verifyArchive } from './restore.ts';

const password = 'synthetic revisit Archive';

async function device() {
  const db = await migratedDb();
  const files = fakeFileStore();
  const journal = openJournal(db, files);
  await journal.reconcileBuiltIns();
  return { db, files, journal };
}

async function sourceDevice() {
  const source = await device();
  const entryId = await source.journal.entries.upsertEntry({ epochDay: 20000, mood: 3, note: 'Shared entry' });
  await source.journal.revisits.setRevisit({ entryId, createdEpochDay: 20000, targetEpochDay: 20010 });
  const otherEntry = await source.journal.entries.upsertEntry({ epochDay: 20001, mood: 4, note: 'Other Archive entry' });
  await source.journal.photos.attach({ entryId: otherEntry }, {
    full: new Uint8Array([2, 3]), thumb: new Uint8Array([4, 5])
  });
  return { ...source, entryId, otherEntry };
}

for (const location of ['same device', 'another device'] as const) {
  test(`Merge keeps the current revisit on ${location} and restores unrelated rows and media`, async () => {
    const source = await sourceDevice();
    const target = location === 'same device' ? source : await device();
    try {
      const snapshot = await source.journal.archive.snapshot();
      const packed = await collect(packArchive({ ...snapshot, preferences: portablePreferences(PREFERENCE_DEFAULTS) }, password, CHEAP_KDF));
      await verifyArchive(oneShot(packed), password);
      let entryId = source.entryId;
      if (location === 'another device') {
        const entry = snapshot.journal.entries.find((row) => row.uuid === snapshot.journal.revisits[0].entryId)!;
        // Local rowids differ between devices; the revisit owner travels by uuid.
        await target.journal.entries.upsertEntry({ epochDay: 19999, mood: 2, note: 'Destination-only entry' });
        await target.db.run('INSERT INTO entry (uuid, epoch_day, timestamp, mood, note, updated_at) VALUES (?, ?, ?, ?, ?, 0)',
          [entry.uuid, entry.epochDay, entry.timestamp, entry.mood, entry.note]);
        entryId = (await target.db.query<{ id: number }>('SELECT id FROM entry WHERE uuid = ?', [entry.uuid]))[0].id;
      } else {
        const old = (await target.journal.revisits.getRevisitForEntry(entryId))!;
        await target.journal.revisits.deleteRevisit(old.id);
        await target.db.run('DELETE FROM entry WHERE id = ?', [source.otherEntry]);
        for (const file of snapshot.files) await target.files.remove(file.name);
      }
      await target.journal.revisits.setRevisit({ entryId, createdEpochDay: 20011, targetEpochDay: 20030 });
      const current = (await target.journal.revisits.getRevisitForEntry(entryId))!;
      assert.notEqual(current.id, snapshot.journal.revisits[0].id);
      const before = await target.db.query('SELECT * FROM revisit');
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const opened = await openArchive(oneShot(packed), password);
        await target.journal.archive.merge({ journal: opened.payload.journal, files: opened.files });
        assert.deepEqual(await target.db.query('SELECT * FROM revisit'), before);
        assert.deepEqual(await target.journal.revisits.getRevisitForEntry(entryId), current);
        const restored = (await target.journal.archive.snapshot()).journal.entries.find((row) => row.note === 'Other Archive entry')!;
        assert.ok(restored);
        assert.equal(restored.photos.length, 1);
        assert.deepEqual(await target.files.read(restored.photos[0].fileName), new Uint8Array([2, 3]));
        assert.deepEqual(await target.files.read(thumbFileName(restored.photos[0].fileName)), new Uint8Array([4, 5]));
        assert.deepEqual(await target.db.query('PRAGMA foreign_key_check'), []);
      }
    } finally {
      await source.db.close();
      if (target !== source) await target.db.close();
    }
  });
}

for (const mode of ['merge', 'replace'] as const) {
  test(`${mode} refuses two incoming revisits for one entry before touching the destination`, async () => {
    const source = await sourceDevice();
    const target = await sourceDevice();
    try {
      const snapshot = await source.journal.archive.snapshot();
      snapshot.journal.revisits.push({ ...snapshot.journal.revisits[0], id: 'another-revisit', targetEpochDay: 20020 });
      const packed = await collect(packArchive({ ...snapshot, preferences: portablePreferences(PREFERENCE_DEFAULTS) }, password, CHEAP_KDF));
      const corrupt = (error: unknown) => {
        assert.ok(error instanceof CorruptArchiveError);
        assert.equal(archiveFailureKind(error), 'corrupt');
        return true;
      };
      await assert.rejects(verifyArchive(oneShot(packed), password), corrupt);
      const before = (await target.journal.archive.snapshot()).journal;
      const names = target.files.names();
      const bytes = await Promise.all(names.map((name) => target.files.read(name)));
      const transaction = vi.spyOn(target.db, 'transaction');
      const list = vi.spyOn(target.files, 'list');
      const write = vi.spyOn(target.files, 'write');
      const opened = await openArchive(oneShot(packed), password);
      let pulled = false;
      await assert.rejects(target.journal.archive[mode]({ journal: opened.payload.journal,
        files: (async function* () { pulled = true; yield* opened.files; })()
      }), corrupt);
      assert.equal(transaction.mock.calls.length, 0);
      assert.equal(list.mock.calls.length, 0);
      assert.equal(write.mock.calls.length, 0);
      assert.equal(pulled, false);
      assert.deepEqual((await target.journal.archive.snapshot()).journal, before);
      assert.deepEqual(target.files.names(), names);
      assert.deepEqual(await Promise.all(names.map((name) => target.files.read(name))), bytes);
    } finally { await source.db.close(); await target.db.close(); }
  });
}

test('healthy encrypted Archives with distinct revisit owners verify and round-trip in both modes', async () => {
  const source = await sourceDevice();
  try {
    await source.journal.revisits.setRevisit({ entryId: source.otherEntry, createdEpochDay: 20002, targetEpochDay: 20020 });
    const snapshot = await source.journal.archive.snapshot();
    const packed = await collect(packArchive({ ...snapshot, preferences: portablePreferences(PREFERENCE_DEFAULTS) }, password, CHEAP_KDF));
    await verifyArchive(oneShot(packed), password);
    for (const mode of ['merge', 'replace'] as const) {
      const target = await device();
      try {
        const opened = await openArchive(oneShot(packed), password);
        await target.journal.archive[mode]({ journal: opened.payload.journal, files: opened.files });
        assert.deepEqual((await target.journal.archive.snapshot()).journal.revisits, snapshot.journal.revisits);
        assert.equal((await target.journal.revisits.getDueRevisits(20030)).length, 2);
        assert.deepEqual(await target.db.query('PRAGMA foreign_key_check'), []);
      } finally { await target.db.close(); }
    }
  } finally { await source.db.close(); }
});
