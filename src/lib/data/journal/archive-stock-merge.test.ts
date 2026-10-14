import assert from 'node:assert/strict';
import { test } from 'vitest';
import { collect } from '../archive/container.ts';
import { openArchive, packArchive } from '../archive/pack.ts';
import { portablePreferences } from '../archive/payload.ts';
import { fakeFileStore } from '../photos/test-support/fake-file-store.ts';
import { PREFERENCE_DEFAULTS } from '../prefs/catalogue.ts';
import { migratedDb } from '../sqlite/test-support/migrated-db.ts';
import { CHEAP_KDF, oneShot } from './golden-archive-fixture.ts';
import { openJournal } from './journal.ts';
import { verifyArchive } from './restore.ts';

async function device() {
  const db = await migratedDb();
  const journal = openJournal(db, fakeFileStore());
  await journal.reconcileBuiltIns();
  return { db, journal };
}

async function* noFiles() {}

test('Merge after a stock rename keeps the destination count and restores an absent entry', async () => {
  const { db, journal } = await device();
  try {
    const id = await journal.stock.upsertEntry({
      drug: 'Estrofem', quantity: 28, unit: 'pills', recordedEpochDay: 20000
    });
    const entryId = await journal.entries.upsertEntry({ epochDay: 20000, mood: 3, note: 'Synthetic entry to restore' });
    const backup = await journal.archive.snapshot();
    await journal.stock.upsertEntry({
      id, drug: 'Estradiol 2mg', quantity: 20, unit: 'pills', recordedEpochDay: 20010,
      openedEpochDay: 20010, inUseWindowDays: 30, leadTimeDays: 5, dosesPerUnit: 2
    });
    await journal.entries.deleteEntry(entryId);
    const stockBefore = await db.query('SELECT * FROM medication_stock');

    await journal.archive.merge({ journal: backup.journal, files: noFiles() });

    assert.deepEqual(await db.query('SELECT * FROM medication_stock'), stockBefore);
    assert.deepEqual(await db.query('SELECT uuid, epoch_day, mood, note FROM entry'), [{
      uuid: backup.journal.entries[0].uuid, epoch_day: 20000, mood: 3, note: 'Synthetic entry to restore'
    }]);
    const afterFirst = await db.query('SELECT * FROM entry');
    await journal.archive.merge({ journal: backup.journal, files: noFiles() });
    assert.deepEqual(await db.query('SELECT * FROM medication_stock'), stockBefore);
    assert.deepEqual(await db.query('SELECT * FROM entry'), afterFirst);
  } finally {
    await db.close();
  }
});

test('Merge keeps a destination drug with another uuid and imports unmatched stock and entries', async () => {
  const source = await device();
  const target = await device();
  try {
    const incomingId = await source.journal.stock.upsertEntry({
      drug: 'Estrofem', quantity: 28, unit: 'pills', recordedEpochDay: 20000
    });
    const otherId = await source.journal.stock.upsertEntry({
      drug: 'Synthetic other drug', quantity: 2, unit: 'vials', recordedEpochDay: 20003
    });
    await source.journal.entries.upsertEntry({ epochDay: 20000, mood: 3, note: 'Synthetic imported entry' });
    const backup = await source.journal.archive.snapshot();
    const destinationId = await target.journal.stock.upsertEntry({
      drug: 'Estrofem', quantity: 60, unit: 'pills', recordedEpochDay: 20010,
      openedEpochDay: 20010, inUseEndEpochDay: 20050, leadTimeDays: 7, dosesPerUnit: 3
    });
    assert.notEqual(destinationId, incomingId);
    await target.db.run('UPDATE medication_stock SET reminder_ever_created = 1, reminder_dismissed = 1 WHERE uuid = ?', [destinationId]);
    await target.journal.entries.upsertEntry({ epochDay: 20001, mood: 4, note: 'Synthetic destination entry' });
    const stockBefore = await target.db.query('SELECT * FROM medication_stock WHERE uuid = ?', [destinationId]);
    const entriesBefore = await target.db.query('SELECT * FROM entry');

    await target.journal.archive.merge({ journal: backup.journal, files: noFiles() });

    assert.deepEqual(await target.db.query('SELECT * FROM medication_stock WHERE uuid = ?', [destinationId]), stockBefore);
    assert.deepEqual(await target.db.query('SELECT uuid, drug, quantity, unit FROM medication_stock ORDER BY drug'), [
      { uuid: destinationId, drug: 'Estrofem', quantity: 60, unit: 'pills' },
      { uuid: otherId, drug: 'Synthetic other drug', quantity: 2, unit: 'vials' }
    ]);
    assert.deepEqual(await target.db.query('SELECT * FROM entry WHERE uuid = ?', [entriesBefore[0].uuid]), entriesBefore);
    assert.deepEqual(await target.db.query('SELECT uuid, epoch_day, mood, note FROM entry ORDER BY epoch_day'), [
      { uuid: backup.journal.entries[0].uuid, epoch_day: 20000, mood: 3, note: 'Synthetic imported entry' },
      { uuid: entriesBefore[0].uuid, epoch_day: 20001, mood: 4, note: 'Synthetic destination entry' }
    ]);
    const stockAfter = await target.db.query('SELECT * FROM medication_stock ORDER BY drug');
    const entriesAfter = await target.db.query('SELECT * FROM entry ORDER BY epoch_day');
    await target.journal.archive.merge({ journal: backup.journal, files: noFiles() });
    assert.deepEqual(await target.db.query('SELECT * FROM medication_stock ORDER BY drug'), stockAfter);
    assert.deepEqual(await target.db.query('SELECT * FROM entry ORDER BY epoch_day'), entriesAfter);
  } finally {
    await source.db.close();
    await target.db.close();
  }
});

test('Merge preserves both destination rows when incoming uuid and drug match different rows', async () => {
  const { db, journal } = await device();
  try {
    const id = await journal.stock.upsertEntry({
      drug: 'Estrofem', quantity: 28, unit: 'pills', recordedEpochDay: 20000
    });
    const entryId = await journal.entries.upsertEntry({ epochDay: 20000, mood: 3, note: 'Synthetic crossing conflict' });
    const backup = await journal.archive.snapshot();
    await journal.stock.upsertEntry({ id, drug: 'Estradiol 2mg', quantity: 20, unit: 'pills', recordedEpochDay: 20010 });
    await journal.stock.upsertEntry({ drug: 'Estrofem', quantity: 45, unit: 'pills', recordedEpochDay: 20011 });
    await journal.entries.deleteEntry(entryId);
    const stockBefore = await db.query('SELECT * FROM medication_stock ORDER BY drug');

    await journal.archive.merge({ journal: backup.journal, files: noFiles() });

    assert.deepEqual(await db.query('SELECT * FROM medication_stock ORDER BY drug'), stockBefore);
    assert.deepEqual(await db.query('SELECT uuid, note FROM entry'), [{
      uuid: backup.journal.entries[0].uuid, note: 'Synthetic crossing conflict'
    }]);
  } finally { await db.close(); }
});

test('healthy encrypted verification and Replace still restore the Archive stock choice after a local rename', async () => {
  const { db, journal } = await device();
  try {
    const id = await journal.stock.upsertEntry({
      drug: 'Estrofem', quantity: 28, unit: 'pills', recordedEpochDay: 20000,
      openedEpochDay: 19999, inUseWindowDays: 45, inUseEndEpochDay: 20044, leadTimeDays: 4, dosesPerUnit: 2
    });
    await db.run('UPDATE medication_stock SET reminder_ever_created = 1, reminder_dismissed = 1 WHERE uuid = ?', [id]);
    await journal.entries.upsertEntry({ epochDay: 20000, mood: 3, note: 'Synthetic verified Archive' });
    const backup = await journal.archive.snapshot();
    const password = 'synthetic stock backup password';
    const packed = await collect(packArchive({
      ...backup, preferences: portablePreferences(PREFERENCE_DEFAULTS)
    }, password, CHEAP_KDF));
    await journal.stock.upsertEntry({ id, drug: 'Estradiol 2mg', quantity: 20, unit: 'pills', recordedEpochDay: 20010 });
    await journal.stock.upsertEntry({ drug: 'Estrofem', quantity: 45, unit: 'pills', recordedEpochDay: 20011 });
    const stockBeforeVerify = await db.query('SELECT * FROM medication_stock ORDER BY drug');

    await verifyArchive(oneShot(packed), password);
    assert.deepEqual(await db.query('SELECT * FROM medication_stock ORDER BY drug'), stockBeforeVerify);
    const opened = await openArchive(oneShot(packed), password);
    await journal.archive.replace({ journal: opened.payload.journal, files: opened.files });

    assert.deepEqual(await journal.stock.getEntries(), backup.journal.medicationStock);
    assert.deepEqual(await db.query('SELECT uuid, drug, quantity, unit FROM medication_stock'), [{
      uuid: id, drug: 'Estrofem', quantity: 28, unit: 'pills'
    }]);
    assert.deepEqual(await db.query('SELECT uuid, epoch_day, mood, note FROM entry'), [{
      uuid: backup.journal.entries[0].uuid, epoch_day: 20000, mood: 3, note: 'Synthetic verified Archive'
    }]);
  } finally { await db.close(); }
});

test('a later stock insert failure still rolls back unrelated rows after a renamed stock match', async () => {
  const { db, journal } = await device();
  try {
    const id = await journal.stock.upsertEntry({ drug: 'Estrofem', quantity: 28, unit: 'pills', recordedEpochDay: 20000 });
    const otherId = await journal.stock.upsertEntry({ drug: 'Synthetic failing drug', quantity: 4, unit: 'vials', recordedEpochDay: 20001 });
    const entryId = await journal.entries.upsertEntry({ epochDay: 20000, mood: 3, note: 'Synthetic rolled-back import' });
    const backup = await journal.archive.snapshot();
    await journal.stock.upsertEntry({ id, drug: 'Estradiol 2mg', quantity: 20, unit: 'pills', recordedEpochDay: 20010 });
    await journal.stock.deleteEntry(otherId);
    await journal.entries.deleteEntry(entryId);
    const stockBefore = await db.query('SELECT * FROM medication_stock');
    const entriesBefore = await db.query('SELECT * FROM entry');
    await db.exec(`CREATE TRIGGER reject_archive_stock BEFORE INSERT ON medication_stock
      WHEN NEW.drug = 'Synthetic failing drug' BEGIN SELECT RAISE(ABORT, 'synthetic stock insert failure'); END`);

    await assert.rejects(journal.archive.merge({ journal: backup.journal, files: noFiles() }), /synthetic stock insert failure/);

    assert.deepEqual(await db.query('SELECT * FROM medication_stock'), stockBefore);
    assert.deepEqual(await db.query('SELECT * FROM entry'), entriesBefore);
  } finally { await db.close(); }
});
