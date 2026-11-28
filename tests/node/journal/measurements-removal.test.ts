import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'vitest';
import { ARCHIVE_SECTION_NAMES, DROPPED_ARCHIVE_SECTION_NAMES } from '../../../src/lib/data/journal/archiveSections.ts';
import { PREFERENCE_DEFAULTS } from '../../../src/lib/data/prefs/catalogue.ts';
import { migratedDb } from '../../../src/lib/data/sqlite/test-support/migrated-db.ts';

const source = (path: string) => readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8');
const removedSections = ['measurementTypes', 'measurements', 'sizeRecords'];

test('measurement tables and archive sections are removed', async () => {
  const db = await migratedDb();
  try {
    const tables = db.raw.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[];
    for (const table of ['measurement', 'measurement_type', 'size_record']) {
      assert.ok(!tables.some((row) => row.name === table), table);
    }
    for (const name of removedSections) {
      assert.ok(!ARCHIVE_SECTION_NAMES.includes(name as never), name);
      assert.ok(DROPPED_ARCHIVE_SECTION_NAMES.includes(name), name);
    }
  } finally {
    await db.close();
  }
});

test('removed addresses and module entry points have no owner', () => {
  assert.equal(existsSync(new URL('../../../src/routes/body/measurements/+page.svelte', import.meta.url)), false);
  for (const path of [
    'src/lib/data/hubRows.ts', 'src/lib/data/liveTiles.ts', 'src/lib/data/pinnedRows.ts',
    'src/routes/onboarding/+page.svelte', 'src/routes/settings/+page.svelte',
    'src/lib/components/BodyRegionInspectorSheet.svelte', 'src/routes/media/photos/+page.svelte'
  ]) {
    assert.doesNotMatch(source(path), /\/body\/(?:measurements|sizes)|measurements-nudge|measurementUnit|measurementsOn|body_region_track_measurements/);
  }
});

test('older measurement preferences have no current defaults', () => {
  for (const key of ['measurementUnit', 'measurementsNudgeEnabled', 'measurementProtocolDismissed']) {
    assert.equal(Object.hasOwn(PREFERENCE_DEFAULTS, key), false, key);
  }
});

test('day, search, and demo no longer use measurement records', () => {
  for (const path of [
    'src/lib/data/journal/day.ts', 'src/lib/data/journal/textSearch.ts',
    'src/lib/data/demo/fullFixture.ts', 'src/lib/components/dayRows.ts',
    'src/lib/components/searchHitRows.ts'
  ]) {
    assert.doesNotMatch(source(path), /\bsizeRecords\b|\bmeasurements\b|\/body\/sizes/);
  }
});

test('migration discards owned rows and keeps unrelated journal rows', async () => {
  const { runMigrations } = await import('../../../src/lib/data/sqlite/migration-runner.ts');
  const { migrations } = await import('../../../src/lib/data/sqlite/migrations.ts');
  const { makeNodeSqliteDb } = await import('../../../src/lib/data/sqlite/test-support/node-sqlite-driver.ts');
  const { noopFileOps } = await import('../../../src/lib/data/sqlite/test-support/migrated-db.ts');
  const db = makeNodeSqliteDb();
  try {
    await runMigrations(db, noopFileOps(), migrations.filter((migration) => migration.version <= 94));
    await db.run("INSERT INTO measurement_type (uuid, key, name, is_built_in, hidden, updated_at) VALUES ('type-1', 'waist', 'Waist', 1, 0, 1)");
    await db.run("INSERT INTO measurement (uuid, epoch_day, type, value, unit, updated_at) VALUES ('m-1', 20000, 'waist', 78, 'cm', 1)");
    await db.run("INSERT INTO size_record (uuid, epoch_day, category, size, updated_at) VALUES ('s-1', 20000, 'shirts', 'M', 1)");
    await db.run("INSERT INTO area_state (area, hidden, updated_at) VALUES ('measurements', 1, 1), ('hairRemovalSessions', 1, 1)");
    await db.run("INSERT INTO pref (key, value) VALUES ('measurementUnit', '\"in\"'), ('name', '\"Alice\"')");
    await db.run("INSERT INTO entry (uuid, epoch_day, timestamp, updated_at) VALUES ('e-1', 20000, 0, 1)");
    await runMigrations(db, noopFileOps(), migrations);
    const tables = await db.query<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table'");
    for (const table of ['measurement', 'measurement_type', 'size_record']) assert.ok(!tables.some((row) => row.name === table), table);
    assert.deepEqual(await db.query("SELECT area FROM area_state"), [{ area: 'hairRemovalSessions' }]);
    assert.deepEqual(await db.query("SELECT key FROM pref"), [{ key: 'name' }]);
    assert.deepEqual(await db.query("SELECT uuid FROM entry"), [{ uuid: 'e-1' }]);
  } finally {
    await db.close();
  }
});

test('older archive drops measurement sections, area state and preferences', async () => {
  const { emptyArchiveJournal } = await import('../../../src/lib/data/journal/archiveSections.ts');
  const { restoreArchive } = await import('../../../src/lib/data/journal/restore.ts');
  const { fakeFileStore } = await import('../../../src/lib/data/photos/test-support/fake-file-store.ts');
  const { openPreferences } = await import('../../../src/lib/data/prefs/preferences.ts');
  const db = await migratedDb();
  try {
    const journal = {
      ...emptyArchiveJournal(),
      measurementTypes: [{ id: 'type-1', key: 'waist' }],
      measurements: [{ id: 'm-1', type: 'waist' }],
      sizeRecords: [{ id: 's-1', category: 'shirts' }],
      areaStates: [
        { area: 'measurements', hidden: true, finishedEpochDay: null, suspendedEpochDay: null },
        { area: 'hairRemovalSessions', hidden: true, finishedEpochDay: null, suspendedEpochDay: null }
      ]
    };
    await restoreArchive(db, fakeFileStore(), 'replace', {
      journal: journal as never,
      preferences: { name: 'Archive name', measurementUnit: 'in', measurementsNudgeEnabled: true, measurementProtocolDismissed: true } as never,
      files: (async function* () {})()
    });
    assert.deepEqual(await db.query('SELECT area FROM area_state'), [{ area: 'hairRemovalSessions' }]);
    const prefs = await openPreferences(db);
    assert.equal(prefs.get('name'), 'Archive name');
    for (const key of ['measurementUnit', 'measurementsNudgeEnabled', 'measurementProtocolDismissed']) {
      assert.ok(!(key in prefs.all()));
      assert.deepEqual(await db.query('SELECT key FROM pref WHERE key = ?', [key]), []);
    }
  } finally {
    await db.close();
  }
});
