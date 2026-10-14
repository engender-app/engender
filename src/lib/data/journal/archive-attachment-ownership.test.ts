import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test, vi } from 'vitest';
import { CorruptArchiveError, collect } from '../archive/container.ts';
import { archiveFailureKind } from '../archive/failure.ts';
import { openArchive, packArchive } from '../archive/pack.ts';
import { portablePreferences, type ArchiveJournal } from '../archive/payload.ts';
import { encryptedFileStore } from '../photos/encrypted-file-store.ts';
import { thumbFileName } from '../photos/names.ts';
import { fakeFileStore } from '../photos/test-support/fake-file-store.ts';
import { PREFERENCE_DEFAULTS } from '../prefs/catalogue.ts';
import { migratedDb } from '../sqlite/test-support/migrated-db.ts';
import { documentThumbName } from './documents.ts';
import { CHEAP_KDF, everySectionDevice, oneShot } from './golden-archive-fixture.ts';
import { openJournal } from './journal.ts';
import type { ArchiveSnapshot } from './archive.ts';
import { verifyArchive } from './restore.ts';

const password = 'synthetic attachment password';
const bytes = (text: string) => new TextEncoder().encode(text);
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

async function device() {
  const db = await migratedDb();
  const disk = fakeFileStore();
  const files = encryptedFileStore(disk, crypto.getRandomValues(new Uint8Array(32)));
  const journal = openJournal(db, files);
  await journal.reconcileBuiltIns();
  await journal.entries.upsertEntry({ epochDay: 20000, mood: 3, note: 'Synthetic preserved entry',
    attachPhotos: [{ full: bytes('preserved full'), thumb: bytes('preserved thumb') }] });
  return { db, disk, files, journal };
}

async function encoded(snapshot: ArchiveSnapshot, mutate: (journal: ArchiveJournal) => void) {
  const journal = structuredClone(snapshot.journal);
  mutate(journal);
  return collect(packArchive({ ...snapshot, journal, preferences: portablePreferences(PREFERENCE_DEFAULTS) }, password, CHEAP_KDF));
}

async function refuses(mode: 'verify' | 'merge' | 'replace', packed: Uint8Array) {
  const target = await device();
  try {
    const before = (await target.journal.archive.snapshot()).journal;
    const diskBefore = new Map(await Promise.all(target.disk.names().map(async (name) => [name, await target.disk.read(name)] as const)));
    const transaction = vi.spyOn(target.db, 'transaction');
    const list = vi.spyOn(target.files, 'list');
    const write = vi.spyOn(target.files, 'write');
    const remove = vi.spyOn(target.files, 'remove');
    let pulled = false;
    const operation = async () => {
      if (mode === 'verify') return verifyArchive(oneShot(packed), password);
      const opened = await openArchive(oneShot(packed), password);
      await target.journal.archive[mode]({ journal: opened.payload.journal, files: (async function* () {
        pulled = true;
        yield* opened.files;
      })() });
    };
    await assert.rejects(operation(), (error: unknown) => {
      assert.ok(error instanceof CorruptArchiveError);
      assert.equal(archiveFailureKind(error), 'corrupt');
      return true;
    });
    assert.equal(transaction.mock.calls.length, 0);
    assert.equal(list.mock.calls.length, 0);
    assert.equal(write.mock.calls.length, 0);
    assert.equal(remove.mock.calls.length, 0);
    assert.equal(pulled, false);
    assert.equal(hash((await target.journal.archive.snapshot()).journal), hash(before));
    assert.deepEqual(target.disk.names(), [...diskBefore.keys()].sort());
    for (const [name, ciphertext] of diskBefore) {
      assert.deepEqual(await target.disk.read(name), ciphertext);
      assert.ok(await target.files.read(name));
    }
  } finally {
    await target.db.close();
  }
}

for (const mode of ['verify', 'merge', 'replace'] as const) {
  test(`${mode} refuses an authenticated two-photo alias before destination mutation`, async () => {
    const source = await device();
    try {
      await source.journal.entries.upsertEntry({ epochDay: 20001, mood: 3,
        attachPhotos: [{ full: bytes('second full'), thumb: bytes('second thumb') }] });
      const snapshot = await source.journal.archive.snapshot();
      const packed = await encoded(snapshot, (j) => { j.entries[1].photos[0].fileName = j.entries[0].photos[0].fileName; });
      await refuses(mode, packed);
      const repeatedChild = await encoded(snapshot, (j) => {
        j.entries[1].photos[0] = { ...j.entries[0].photos[0] };
      });
      await refuses(mode, repeatedChild);
    } finally {
      await source.db.close();
    }
  });

  test(`${mode} applies physical ownership to every file family and derived names`, async () => {
    const source = await everySectionDevice();
    try {
      await source.journal.documents.addDocument({ epochDay: 20000, title: 'Synthetic PDF' }, { pdfBytes: bytes('synthetic pdf'), thumb: bytes('pdf preview') });
      const snapshot = await source.journal.archive.snapshot();
      const full = snapshot.journal.entries[0].photos[0].fileName;
      const mutations: ((j: ArchiveJournal) => void)[] = [
        (j) => { j.milestones.find((row) => row.photo)!.photo!.fileName = full; },
        (j) => { j.hairPhotos[0].fileName = full; },
        (j) => { j.hairRemovalSessions.find((row) => row.photos.length)!.photos[0].fileName = full; },
        (j) => { j.procedures.find((row) => row.photos.length)!.photos[0].fileName = full; },
        (j) => { j.tryouts.find((row) => row.photos.length)!.photos[0].fileName = full; },
        (j) => { j.documents[0].fileName = full; },
        (j) => { j.entries[0].recordings[0].fileName = full; },
        (j) => { j.entries[0].videos[0].fileName = full; },
        (j) => { j.voiceBenchmarks[0].passageFileName = full; },
        (j) => { j.voiceBenchmarks[0].vowelFileName = full; },
        (j) => { j.hairPhotos[0].fileName = thumbFileName(full); },
        (j) => { j.hairPhotos[0].fileName = documentThumbName(j.documents.find((row) => row.fileName.endsWith('.pdf'))!.fileName); }
      ];
      for (const mutation of mutations) await refuses(mode, await encoded(snapshot, mutation));
    } finally {
      await source.driver.close();
    }
  });
}

for (const mode of ['merge', 'replace'] as const) {
  test(`${mode} restores healthy missing-file placeholders and deleting one photo preserves another`, async () => {
    const source = await device();
    const target = await device();
    try {
      await source.journal.entries.upsertEntry({ epochDay: 20001, mood: 3,
        attachPhotos: [{ full: bytes('second full'), thumb: bytes('second thumb') }] });
      await source.journal.documents.addDocument({ epochDay: 20000, title: 'PDF without preview' }, { pdfBytes: bytes('synthetic pdf'), thumb: null });
      const snapshot = await source.journal.archive.snapshot();
      const missing = snapshot.journal.entries[0].photos[0].fileName;
      const placeholder = { ...snapshot, files: snapshot.files.filter((file) => file.name !== missing) };
      const packed = await encoded(placeholder, () => {});
      await verifyArchive(oneShot(packed), password);
      const opened = await openArchive(oneShot(packed), password);
      await target.journal.archive[mode]({ journal: opened.payload.journal, files: opened.files });
      const imported = await target.journal.entries.entriesForDay(20001);
      assert.equal(imported.length, 1);
      const otherName = imported[0].photos[0].fileName;
      assert.ok(otherName);
      assert.deepEqual(await target.files.read(otherName), bytes('second full'));
      await target.journal.photos.remove(snapshot.journal.entries[0].photos[0].id);
      assert.deepEqual(await target.files.read(otherName), bytes('second full'));
      assert.deepEqual(await target.files.read(thumbFileName(otherName)), bytes('second thumb'));
      const exported = await target.journal.archive.snapshot();
      const roundTrip = await encoded(exported, () => {});
      await verifyArchive(oneShot(roundTrip), password);
    } finally {
      await source.db.close();
      await target.db.close();
    }
  });
}

test('a benchmark row may claim the same name for both of its own audio fields', async () => {
  const source = await everySectionDevice();
  try {
    const packed = await encoded(await source.journal.archive.snapshot(), (j) => {
      j.voiceBenchmarks[0].vowelFileName = j.voiceBenchmarks[0].passageFileName;
    });
    await verifyArchive(oneShot(packed), password);
    for (const mode of ['merge', 'replace'] as const) {
      const target = await device();
      try {
        const opened = await openArchive(oneShot(packed), password);
        await target.journal.archive[mode]({ journal: opened.payload.journal, files: opened.files });
        const restored = await target.journal.archive.snapshot();
        assert.equal(restored.journal.voiceBenchmarks[0].passageFileName, restored.journal.voiceBenchmarks[0].vowelFileName);
      } finally { await target.db.close(); }
    }
  } finally { await source.driver.close(); }
});
