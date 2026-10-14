import assert from 'node:assert/strict';
import { test } from 'vitest';
import { collect } from '../archive/container.ts';
import { openArchive, packArchive } from '../archive/pack.ts';
import { portablePreferences } from '../archive/payload.ts';
import { startOfDayTimestamp } from '../epochDay.ts';
import { readCare } from '../careReads.ts';
import { fakeFileStore } from '../photos/test-support/fake-file-store.ts';
import { runMigrations } from '../sqlite/migration-runner.ts';
import { migrations } from '../sqlite/migrations.ts';
import { migratedDb, noopFileOps } from '../sqlite/test-support/migrated-db.ts';
import { makeNodeSqliteDb } from '../sqlite/test-support/node-sqlite-driver.ts';
import { PREFERENCE_DEFAULTS } from '../prefs/catalogue.ts';
import { CHEAP_KDF, oneShot } from './golden-archive-fixture.ts';
import { openJournal } from './journal.ts';
import { verifyArchive } from './restore.ts';

test.each([
  ['Estradiol', ' estradiol '],
  ['ŻEL', 'żel'],
  ['İLAÇ', 'i̇laç']
])('a refill of %s as %s keeps one stock identity, projection and reminder', async (first, second) => {
  const db = await migratedDb();
  const journal = openJournal(db, fakeFileStore());
  try {
    await journal.reconcileBuiltIns();
    await journal.regimen.upsertEpisode({ drug: first, ester: null, dose: 2, doseUnit: 'mg', route: 'oral',
      interval: 'daily', startEpochDay: 20000, endEpochDay: null, endReason: null });
    await journal.doses.upsertDose({ timestamp: startOfDayTimestamp(20000) + 8 * 3600000,
      drug: second.trim(), route: 'oral', dose: 2, doseUnit: 'mg' });
    const id = await journal.stock.upsertEntry({ drug: first, quantity: 3, unit: 'pills', recordedEpochDay: 20000 });
    await journal.stock.reconcileRunOutReminders(20000);
    const originalReminder = (await journal.reminders.getReminders())[0];
    assert.ok(originalReminder);
    assert.equal(await journal.stock.upsertEntry({ drug: second, quantity: 4, unit: 'pills', recordedEpochDay: 20000 }), id);
    await journal.stock.reconcileRunOutReminders(20000);
    const entries = await journal.stock.getEntries();
    assert.equal(entries.length, 1);
    assert.equal(entries[0].drug, second.trim());
    assert.equal(entries[0].quantity, 4);
    const projections = await journal.stock.getProjections(20000);
    assert.equal(projections.length, 1);
    assert.equal(projections[0].projection.remaining, 3);
    const care = await readCare(journal, 20000);
    assert.equal(care.stock.length, 1);
    assert.equal(care.stock[0].entry.id, id);
    const reminders = await journal.reminders.getReminders();
    assert.equal(reminders.length, 1);
    assert.equal(reminders[0].id, originalReminder.id);
    await journal.stock.upsertEntry({ id, drug: ` ${first} `, quantity: 4, unit: 'pills', recordedEpochDay: 20000 });
    await journal.stock.reconcileRunOutReminders(20000);
    assert.equal((await journal.reminders.getReminders())[0].id, originalReminder.id);
    assert.equal((await journal.stock.getEntries()).length, 1);
  } finally { await db.close(); }
});

test('Merge matches case variants but still preserves a locally renamed stock uuid', async () => {
  const db = await migratedDb();
  const journal = openJournal(db, fakeFileStore());
  try {
    const id = await journal.stock.upsertEntry({ drug: 'Estradiol', quantity: 28, unit: 'pills', recordedEpochDay: 20000 });
    const snapshot = await journal.archive.snapshot();
    await journal.stock.upsertEntry({ id, drug: 'Estradiol 2mg', quantity: 20, unit: 'pills', recordedEpochDay: 20010 });
    const other = await journal.stock.upsertEntry({ drug: 'ESTRADIOL', quantity: 45, unit: 'pills', recordedEpochDay: 20011 });
    snapshot.journal.medicationStock.push({ ...snapshot.journal.medicationStock[0], id: 'another-device', drug: ' estradiol ' });
    await journal.archive.merge({ journal: snapshot.journal, files: (async function* () {})() });
    assert.deepEqual((await journal.stock.getEntries()).map(({ id, drug, quantity }) => ({ id, drug, quantity })), [
      { id: other, drug: 'ESTRADIOL', quantity: 45 }, { id, drug: 'Estradiol 2mg', quantity: 20 }
    ]);
  } finally { await db.close(); }
});

for (const mode of ['merge', 'replace'] as const) {
  test.each([
    ['ŻEL', 'żel', 'żel'],
    [' estradiol ', 'Estradiol', 'estradiol'],
    ['i̇laç', 'İLAÇ', 'i̇laç']
  ])(`${mode} selects one whole legacy exported stock row for %s and %s and its automatic reminder`, async (firstDrug, lastDrug, key) => {
    const sourceDb = makeNodeSqliteDb();
    const targetDb = await migratedDb();
    const source = openJournal(sourceDb, fakeFileStore());
    const target = openJournal(targetDb, fakeFileStore());
    try {
      await runMigrations(sourceDb, noopFileOps(), migrations.filter((migration) => migration.version <= 90));
      await source.reconcileBuiltIns();
      for (const [id, drug, quantity, day, updated] of [
        ['first', firstDrug, 7, 20010, 200], ['last', lastDrug, 59, 20000, 100]
      ] as const) {
        await sourceDb.run(`INSERT INTO medication_stock
          (uuid, drug, quantity, unit, recorded_epoch_day, reminder_ever_created, reminder_dismissed,
           opened_epoch_day, in_use_window_days, in_use_end_epoch_day, lead_time_days, doses_per_unit, updated_at)
          VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?)`,
          [id, drug, quantity, id, day, id === 'first' ? 1 : 0, day - 1, quantity, day + 9, quantity + 1, quantity + 2, updated]);
        await sourceDb.run(`INSERT INTO reminder(uuid, title, type, time, epoch_day, auto_source, updated_at)
          VALUES (?, ?, 'med', '09:00', ?, ?, ?)`, [`auto-${id}`, drug, day + 1, `stock:${drug}`, updated]);
      }
      await sourceDb.run(`INSERT INTO reminder(uuid, title, type, time, epoch_day, updated_at)
        VALUES ('manual', 'A manual reminder', 'med', '10:00', 20020, 300)`);
      await source.entries.upsertEntry({ epochDay: 20000, mood: 3, note: 'Legacy Archive entry' });
      const snapshot = await source.archive.snapshot();
      assert.deepEqual(snapshot.journal.medicationStock.map((row) => row.id), ['first', 'last']);
      assert.equal('updated_at' in snapshot.journal.medicationStock[0], false);
      assert.equal('drugKey' in snapshot.journal.medicationStock[0], false);
      const packed = await collect(packArchive({ ...snapshot, preferences: portablePreferences(PREFERENCE_DEFAULTS) },
        'synthetic legacy stock', CHEAP_KDF));
      await verifyArchive(oneShot(packed), 'synthetic legacy stock');
      const opened = await openArchive(oneShot(packed), 'synthetic legacy stock');
      await target.archive[mode]({ journal: opened.payload.journal, files: opened.files });
      assert.deepEqual((await target.archive.snapshot()).journal.medicationStock, [snapshot.journal.medicationStock[1]]);
      assert.deepEqual((await target.reminders.getReminders()).map(({ id, autoSource }) => ({ id, autoSource })), [
        { id: 'auto-last', autoSource: `stock:${key}` }, { id: 'manual', autoSource: null }
      ]);
      assert.equal((await target.archive.snapshot()).journal.entries.length, 1);
      const before = await targetDb.query('SELECT * FROM medication_stock');
      const reminders = await targetDb.query('SELECT * FROM reminder ORDER BY id');
      const repeated = await openArchive(oneShot(packed), 'synthetic legacy stock');
      await target.archive.merge({ journal: repeated.payload.journal, files: repeated.files });
      assert.deepEqual(await targetDb.query('SELECT * FROM medication_stock'), before);
      assert.deepEqual(await targetDb.query('SELECT * FROM reminder ORDER BY id'), reminders);
      assert.deepEqual(await targetDb.query('PRAGMA foreign_key_check'), []);
    } finally { await sourceDb.close(); await targetDb.close(); }
  });
}

test('legacy stock selection filters destination uuids before choosing siblings and preserves destination keys', async () => {
  const db = await migratedDb();
  const journal = openJournal(db, fakeFileStore());
  try {
    const renamed = await journal.stock.upsertEntry({ drug: 'Estradiol', quantity: 28, unit: 'pills', recordedEpochDay: 20000 });
    const snapshot = await journal.archive.snapshot();
    await journal.stock.upsertEntry({ id: renamed, drug: 'Estradiol 2mg', quantity: 20, unit: 'pills', recordedEpochDay: 20010 });
    const destination = await journal.stock.upsertEntry({ drug: 'ŻEL', quantity: 40, unit: 'pumps', recordedEpochDay: 20010 });
    await db.run(`INSERT INTO reminder(uuid, title, type, time, epoch_day, auto_source, updated_at)
      VALUES ('destination-auto', 'Destination reminder', 'med', '09:00', 20020, 'stock:żel', 100),
        ('destination-manual', 'A taken-over reminder', 'med', '09:00', 20020, NULL, 100)`);
    const before = await db.query('SELECT * FROM medication_stock ORDER BY id');
    const reminders = await db.query('SELECT * FROM reminder ORDER BY id');
    const old = snapshot.journal.medicationStock[0];
    snapshot.journal.medicationStock = [
      { ...old, id: 'incoming', drug: ' estradiol ', quantity: 59 }, old,
      { ...old, id: 'gel-first', drug: 'żel', quantity: 4 },
      { ...old, id: 'gel-last', drug: ' ŻEL ', quantity: 9 }
    ];
    const reminder = { title: 'Incoming reminder', type: 'med' as const, time: '09:00', recurrence: null,
      interval: null, anchorEpochDay: null, epochDay: 20020, enabled: true };
    snapshot.journal.reminders = [
      { ...reminder, id: 'incoming-auto', autoSource: 'stock: estradiol ' },
      { ...reminder, id: 'discarded-uuid-auto', autoSource: 'stock:Estradiol' },
      { ...reminder, id: 'discarded-key-auto', autoSource: 'stock: ŻEL ' },
      { ...reminder, id: 'destination-manual', autoSource: 'stock: ŻEL ' },
      { ...reminder, id: 'unrelated-auto', autoSource: 'stock:Unrelated' },
      { ...reminder, id: 'incoming-manual', autoSource: null }
    ];
    await journal.archive.merge({ journal: snapshot.journal, files: (async function* () {})() });
    assert.deepEqual(await db.query('SELECT * FROM medication_stock WHERE uuid IN (?, ?) ORDER BY id', [renamed, destination]), before);
    assert.deepEqual((await journal.archive.snapshot()).journal.medicationStock.find((row) => row.id === 'incoming'),
      snapshot.journal.medicationStock[0]);
    assert.equal((await journal.stock.getEntries()).length, 3);
    assert.deepEqual(await db.query('SELECT * FROM reminder WHERE uuid IN (?, ?) ORDER BY id',
      ['destination-auto', 'destination-manual']), reminders);
    assert.deepEqual((await journal.reminders.getReminders()).map(({ id, autoSource }) => ({ id, autoSource })), [
      { id: 'destination-auto', autoSource: 'stock:żel' }, { id: 'destination-manual', autoSource: null },
      { id: 'incoming-auto', autoSource: 'stock:estradiol' },
      { id: 'unrelated-auto', autoSource: 'stock:Unrelated' }, { id: 'incoming-manual', autoSource: null }
    ]);
  } finally { await db.close(); }
});

for (const version of [88, 90]) {
  test(`schema ${version} stock duplicates keep the latest complete choice and its reminder on upgrade`, async () => {
    const db = makeNodeSqliteDb();
    try {
      await runMigrations(db, noopFileOps(), migrations.filter((migration) => migration.version <= version));
      for (const [uuid, drug, quantity, updated] of [
        ['older', 'Estradiol', 7, 100], ['winner', 'estradiol', 59, 200],
        ['tie-old', 'ŻEL', 4, 300], ['tie-new', 'żel', 9, 300]
      ] as const) {
        await db.run(`INSERT INTO medication_stock
          (uuid, drug, quantity, unit, recorded_epoch_day, reminder_ever_created, reminder_dismissed,
           opened_epoch_day, in_use_window_days, lead_time_days, doses_per_unit, updated_at)
          VALUES (?, ?, ?, 'pills', 20000, 1, 0, 19999, 40, 3, 2, ?)`, [uuid, drug, quantity, updated]);
        await db.run(`INSERT INTO reminder(uuid, title, type, time, epoch_day, auto_source, updated_at)
          VALUES (?, ?, 'med', '09:00', 20001, ?, ?)`, [`reminder-${uuid}`, drug, `stock:${drug}`, updated]);
      }
      await db.run(`INSERT INTO reminder(uuid, title, type, time, epoch_day, updated_at)
        VALUES ('manual', 'A manual reminder', 'med', '09:00', 20001, 400)`);
      await runMigrations(db, noopFileOps(), migrations);
      assert.equal(db.getUserVersion(), 91);
      assert.deepEqual(await db.query(`SELECT uuid, drug, drug_key, quantity, opened_epoch_day,
        in_use_window_days, lead_time_days, doses_per_unit, reminder_ever_created, reminder_dismissed
        FROM medication_stock ORDER BY id`), [
        { uuid: 'winner', drug: 'estradiol', drug_key: 'estradiol', quantity: 59, opened_epoch_day: 19999,
          in_use_window_days: 40, lead_time_days: 3, doses_per_unit: 2, reminder_ever_created: 1, reminder_dismissed: 0 },
        { uuid: 'tie-new', drug: 'żel', drug_key: 'żel', quantity: 9, opened_epoch_day: 19999,
          in_use_window_days: 40, lead_time_days: 3, doses_per_unit: 2, reminder_ever_created: 1, reminder_dismissed: 0 }
      ]);
      assert.deepEqual(await db.query('SELECT uuid, auto_source FROM reminder ORDER BY id'), [
        { uuid: 'reminder-winner', auto_source: 'stock:estradiol' },
        { uuid: 'reminder-tie-new', auto_source: 'stock:żel' }, { uuid: 'manual', auto_source: null }
      ]);
      assert.deepEqual(await db.query('PRAGMA foreign_key_check'), []);
      await runMigrations(db, noopFileOps(), migrations);
      assert.equal((await db.query('SELECT uuid FROM medication_stock')).length, 2);
      await assert.rejects(db.run(`INSERT INTO medication_stock(uuid, drug, drug_key, quantity, unit, recorded_epoch_day, updated_at)
        VALUES ('duplicate', 'ESTRADIOL', 'estradiol', 1, 'pills', 20000, 500)`), /UNIQUE constraint/);
    } finally { await db.close(); }
  });
}

test('a failed identity repair rolls back stock, reminders and schema, then a retry succeeds', async () => {
  const db = makeNodeSqliteDb();
  try {
    await runMigrations(db, noopFileOps(), migrations.filter((migration) => migration.version <= 90));
    await db.run(`INSERT INTO medication_stock(uuid, drug, quantity, unit, recorded_epoch_day, updated_at)
      VALUES ('first', 'Estradiol', 7, 'pills', 20000, 100), ('last', 'estradiol', 59, 'pills', 20001, 200)`);
    await db.run(`INSERT INTO reminder(uuid, title, type, time, epoch_day, auto_source, updated_at)
      VALUES ('first-reminder', 'Estradiol', 'med', '09:00', 20001, 'stock:Estradiol', 100)`);
    const stock = await db.query('SELECT * FROM medication_stock ORDER BY id');
    const reminders = await db.query('SELECT * FROM reminder ORDER BY id');
    const interrupted = migrations.map((migration) => migration.version !== 91 ? migration : {
      ...migration,
      apply: async (scope: Parameters<NonNullable<typeof migration.apply>>[0]) => {
        await migration.apply!(scope);
        throw new Error('synthetic interruption after stock repair');
      }
    });
    await assert.rejects(runMigrations(db, noopFileOps(), interrupted), /synthetic interruption after stock repair/);
    assert.equal(db.getUserVersion(), 90);
    assert.deepEqual(await db.query('SELECT * FROM medication_stock ORDER BY id'), stock);
    assert.deepEqual(await db.query('SELECT * FROM reminder ORDER BY id'), reminders);
    assert.equal((await db.query<{ name: string }>('PRAGMA table_info(medication_stock)')).some((row) => row.name === 'drug_key'), false);
    await runMigrations(db, noopFileOps(), migrations);
    assert.equal(db.getUserVersion(), 91);
    assert.deepEqual(await db.query('SELECT uuid, quantity FROM medication_stock'), [{ uuid: 'last', quantity: 59 }]);
    assert.deepEqual(await db.query('SELECT uuid FROM reminder'), []);
  } finally { await db.close(); }
});
