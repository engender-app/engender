import assert from 'node:assert/strict';
import { test } from 'vitest';
import { collect } from '../archive/container.ts';
import { openArchive, packArchive } from '../archive/pack.ts';
import { portablePreferences } from '../archive/payload.ts';
import { PREFERENCE_DEFAULTS } from '../prefs/catalogue.ts';
import { encryptedFileStore } from '../photos/encrypted-file-store.ts';
import { fakeFileStore } from '../photos/test-support/fake-file-store.ts';
import { migratedDb } from '../sqlite/test-support/migrated-db.ts';
import { openJournal, type PhotoFileStore } from './journal.ts';
import type { RestoreContents } from './restore.ts';
import { CHEAP_KDF, everySectionDevice, oneShot } from './golden-archive-fixture.ts';
import { sweepOrphanPhotos } from './photos.ts';

const bytes = (text: string) => new TextEncoder().encode(text);

async function device() {
  const db = await migratedDb();
  const disk = fakeFileStore();
  let fault: 'partial' | 'full' | null = null;
  const native: PhotoFileStore = {
    ...disk,
    async write(name, data) {
      // Model FileOutputStream truncation before a failed native write.
      if (fault) {
        await disk.write(name, fault === 'partial' ? data.slice(0, 10) : new Uint8Array());
        throw new Error('disk full');
      }
      await disk.write(name, data);
    }
  };
  const files = encryptedFileStore(native, crypto.getRandomValues(new Uint8Array(32)));
  const journal = openJournal(db, files);
  await journal.reconcileBuiltIns();
  const entryId = await journal.entries.upsertEntry({
    epochDay: 20_000, mood: 4, note: 'keep me',
    attachPhotos: [{ full: bytes('original photo'), thumb: bytes('original thumbnail') }]
  });
  const snapshot = await journal.archive.snapshot();
  const original = new Map(await Promise.all(snapshot.files.map(async ({ name }) => [name, await files.read(name)] as const)));
  const ciphertext = new Map(await Promise.all(snapshot.files.map(async ({ name }) => [name, await disk.read(name)] as const)));
  const contents = (): RestoreContents => ({
    journal: snapshot.journal,
    fileCount: original.size,
    files: (async function* () {
      for (const [name, data] of original) yield { name, bytes: data! };
    })()
  });
  return { db, disk, files, journal, entryId, snapshot, original, ciphertext, contents, failWrites: (kind: typeof fault) => { fault = kind; } };
}

for (const mode of ['merge', 'replace'] as const) {
  for (const fault of ['partial', 'full'] as const) {
    test(`${mode} preserves existing rows and encrypted photos after a ${fault} native write failure`, async () => {
      const made = await device();
      made.failWrites(fault);

      await assert.rejects(made.journal.archive[mode](made.contents()), /disk full/);

      assert.deepEqual((await made.journal.archive.snapshot()).journal, made.snapshot.journal);
      for (const [name, data] of made.original) {
        assert.deepEqual(await made.disk.read(name), made.ciphertext.get(name));
        assert.deepEqual(await made.files.read(name), data);
      }
      assert.deepEqual(made.disk.names(), [...made.original.keys()].sort());
    });
  }

  test(`${mode} preserves colliding photos when the file stream is interrupted`, async () => {
    const made = await device();
    const contents = made.contents();
    contents.files = (async function* () {
      for (const [name, data] of made.original) yield { name, bytes: data! };
      throw new Error('archive interrupted');
    })();

    await assert.rejects(made.journal.archive[mode](contents), /archive interrupted/);

    assert.deepEqual((await made.journal.archive.snapshot()).journal, made.snapshot.journal);
    for (const [name, data] of made.original) assert.deepEqual(await made.files.read(name), data);
    assert.deepEqual(made.disk.names(), [...made.original.keys()].sort());
  });

  test(`${mode} preserves colliding photos when SQLite rejects the restore`, async () => {
    const made = await device();
    const contents = made.contents();
    contents.journal = {
      ...contents.journal,
      entries: [...contents.journal.entries, {
        ...contents.journal.entries[0], uuid: 'invalid-entry', mood: 100
      }]
    };

    await assert.rejects(made.journal.archive[mode](contents));

    assert.deepEqual((await made.journal.archive.snapshot()).journal, made.snapshot.journal);
    for (const [name, data] of made.original) {
      assert.deepEqual(await made.disk.read(name), made.ciphertext.get(name));
      assert.deepEqual(await made.files.read(name), data);
    }
    assert.deepEqual(made.disk.names(), [...made.original.keys()].sort());
  });

  test(`${mode} re-imports the same encrypted archive with readable photos and thumbnails`, async () => {
    const made = await device();
    const archive = await collect(packArchive({
      journal: made.snapshot.journal, preferences: portablePreferences(PREFERENCE_DEFAULTS),
      files: made.snapshot.files, readFile: made.snapshot.readFile
    }, 'archive password', CHEAP_KDF));

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const opened = await openArchive(oneShot(archive), 'archive password');
      await made.journal.archive[mode]({ journal: opened.payload.journal, files: opened.files });
      const saved = await made.journal.entries.entriesForDay(20_000);
      assert.equal(saved.length, 1);
      assert.equal(saved[0].photos[0].id, made.snapshot.journal.entries[0].photos[0].id);
      const snapshot = await made.journal.archive.snapshot();
      assert.equal(snapshot.files.length, 2);
      const read = await Promise.all(snapshot.files.map(({ name }) => snapshot.readFile(name)));
      assert.deepEqual(read.map((data) => new TextDecoder().decode(data)).sort(), ['original photo', 'original thumbnail']);
      for (const [name, data] of made.ciphertext) assert.deepEqual(await made.disk.read(name), data);
    }
    if (mode === 'merge') assert.deepEqual(made.disk.names(), [...made.original.keys()].sort());
  });

  test(`${mode} handles different archive bytes under the same photo identifier`, async () => {
    const made = await device();
    const contents = made.contents();
    contents.files = (async function* () {
      for (const name of made.original.keys()) yield { name, bytes: bytes('archive bytes') };
    })();

    await made.journal.archive[mode](contents);

    const snapshot = await made.journal.archive.snapshot();
    for (const { name } of snapshot.files) {
      assert.deepEqual(await snapshot.readFile(name), mode === 'replace' ? bytes('archive bytes') : made.original.get(name));
    }
    for (const [name, data] of made.ciphertext) assert.deepEqual(await made.disk.read(name), data);
  });
}

test('replacement filenames preserve every attachment owner and its derived thumbnail', async () => {
  const source = await everySectionDevice();
  const snapshot = await source.journal.archive.snapshot();
  const target = await device();
  const archive = await collect(packArchive({
    journal: snapshot.journal, preferences: portablePreferences(PREFERENCE_DEFAULTS),
    files: snapshot.files, readFile: snapshot.readFile
  }, 'archive password', CHEAP_KDF));

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const opened = await openArchive(oneShot(archive), 'archive password');
    await target.journal.archive.replace({ journal: opened.payload.journal, files: opened.files });
    await sweepOrphanPhotos(target.db, target.files);
    const restored = await target.journal.archive.snapshot();
    assert.equal(restored.files.length, snapshot.files.length);
    const restoredBytes = await Promise.all(restored.files.map(({ name }) => restored.readFile(name)));
    const originalBytes = await Promise.all(snapshot.files.map(({ name }) => snapshot.readFile(name)));
    const sortedBytes = (values: Uint8Array[]) => values.map((data) => Buffer.from(data).toString('hex')).sort();
    assert.deepEqual(sortedBytes(restoredBytes), sortedBytes(originalBytes));
    assert.deepEqual(target.disk.names(), restored.files.map(({ name }) => name).sort());
  }
});

test('replacement cleanup failure leaves a committed merge successful and retries at the orphan sweep', async () => {
  const made = await device();
  made.disk.failNthRemove(1);

  await made.journal.archive.merge(made.contents());

  assert.deepEqual((await made.journal.archive.snapshot()).journal, made.snapshot.journal);
  for (const [name, data] of made.original) assert.deepEqual(await made.files.read(name), data);
  assert.equal(made.disk.names().length, made.original.size + 1);
  await sweepOrphanPhotos(made.db, made.files);
  assert.deepEqual(made.disk.names(), [...made.original.keys()].sort());
});
