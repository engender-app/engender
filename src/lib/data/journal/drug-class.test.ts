import assert from 'node:assert/strict';
import { test } from 'vitest';
import { fakeFileStore } from '../photos/test-support/fake-file-store.ts';
import { runMigrations } from '../sqlite/migration-runner.ts';
import { migrations } from '../sqlite/migrations.ts';
import { LATEST_SCHEMA_VERSION } from '../sqlite/schema-version.ts';
import { migratedDb, noopFileOps } from '../sqlite/test-support/migrated-db.ts';
import { makeNodeSqliteDb } from '../sqlite/test-support/node-sqlite-driver.ts';
import { openJournal } from './journal.ts';

/* Every episode carries a drug class. */

test('upgrading from schema 92 classifies each existing episode from its drug', async () => {
  const db = makeNodeSqliteDb();
  try {
    await runMigrations(db, noopFileOps(), migrations.filter((migration) => migration.version <= 92));
    for (const [uuid, drug] of [['e', 'Estradiol valerate'], ['s', 'Sertraline'], ['c', 'Octan cyproteronu']]) {
      await db.run(`INSERT INTO regimen_episode (uuid, drug, dose, dose_unit, route, interval, start_epoch_day, updated_at)
        VALUES (?, ?, 1, 'mg', 'oral', 'daily', 100, 1)`, [uuid, drug]);
    }
    await runMigrations(db, noopFileOps(), migrations);
    assert.equal(db.getUserVersion(), LATEST_SCHEMA_VERSION);
    assert.deepEqual(await db.query('SELECT uuid, drug_class FROM regimen_episode ORDER BY id'), [
      { uuid: 'e', drug_class: 'hrt' },
      { uuid: 's', drug_class: 'other' },
      { uuid: 'c', drug_class: 'hrt' }
    ]);
  } finally {
    await db.close();
  }
});

test('a new episode starts inferred, an edit without a class keeps the stored one, and a chosen class is kept', async () => {
  const db = await migratedDb();
  try {
    const journal = openJournal(db, fakeFileStore());
    const base = { ester: null, dose: 1, doseUnit: 'mg', route: 'oral', interval: 'daily', startEpochDay: 100, endEpochDay: null, endReason: null };
    const ssri = await journal.regimen.upsertEpisode({ ...base, drug: 'Sertraline' });
    const fin = await journal.regimen.upsertEpisode({ ...base, drug: 'Finasteride', drugClass: 'hrt' });
    const classes = async () => Object.fromEntries((await journal.regimen.getEpisodes()).map((e) => [e.id, e.drugClass]));
    assert.deepEqual(await classes(), { [ssri]: 'other', [fin]: 'hrt' });

    await journal.regimen.upsertEpisode({ ...base, id: fin, drug: 'Finasteride', dose: 2 });
    assert.equal((await classes())[fin], 'hrt', 'an edit naming no class does not reset the chosen one');

    await journal.regimen.upsertEpisode({ ...base, id: fin, drug: 'Finasteride', drugClass: 'other' });
    assert.equal((await classes())[fin], 'other');
  } finally {
    await db.close();
  }
});
