/* Version 124: tally and hair stages are dropped, hair photos become progress
   photos in the 'hair' pose (tally-and-hair-fold-migration.ts). */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runMigrations } from './migration-runner.ts';
import { migrations } from './migrations.ts';
import { fakeFileStore } from '../photos/test-support/fake-file-store.ts';
import { openJournal } from '../journal/journal.ts';
import { noopFileOps } from './test-support/migrated-db.ts';
import { makeNodeSqliteDb } from './test-support/node-sqlite-driver.ts';

const FOLD_VERSION = 124;
const RC1_JOURNAL = new URL('../../../../fixtures/released/1.0.0-rc.1/journal.sqlite', import.meta.url).pathname;

type Db = ReturnType<typeof makeNodeSqliteDb>;
const rows = (db: Db, sql: string) => db.raw.prepare(sql).all().map((row) => ({ ...(row as object) }));
const tables = (db: Db) =>
  rows(db, "SELECT name FROM sqlite_master WHERE type = 'table'").map((row) => (row as { name: string }).name);

const SEED = `
INSERT INTO hair_photo (uuid, epoch_day, file_path, updated_at) VALUES
  ('hp1', 100, 'hp1.enc', 1000), ('hp2', 130, 'hp2.enc', 2000);
INSERT INTO hair_stage (uuid, epoch_day, description, updated_at) VALUES ('hs1', 100, 'thinner at the crown', 1000);
INSERT INTO tally_event (uuid, epoch_day, kind, updated_at) VALUES ('te1', 101, 'misgendered', 1000);
INSERT INTO progress_photo (uuid, epoch_day, pose, file_path, updated_at) VALUES ('pp1', 90, 'side', 'pp1.enc', 500);
INSERT INTO area_state (area, hidden, updated_at) VALUES
  ('hairStages', 1, 1), ('hairPhotos', 1, 1), ('tallyEvents', 1, 1), ('hairRemovalSessions', 1, 1);
INSERT INTO pref (key, value) VALUES ('hairPhotoProtocolDismissed', 'true');
`;

test('version 124 moves hair photos into progress photos as the hair pose and drops the three tables', async () => {
  const db = makeNodeSqliteDb();
  await runMigrations(db, noopFileOps(), migrations.filter((m) => m.version < FOLD_VERSION));
  db.raw.exec(SEED);
  db.raw.exec("DELETE FROM hair_stage WHERE uuid = 'gone'; DELETE FROM tally_event WHERE uuid = 'nothing'");
  db.raw.exec("INSERT INTO hair_stage (uuid, epoch_day, description, updated_at) VALUES ('hs2', 5, 'x', 1); DELETE FROM hair_stage WHERE uuid = 'hs2'");
  assert.equal(rows(db, "SELECT * FROM deletion WHERE tbl = 'hair_stage'").length, 1);

  await runMigrations(db, noopFileOps(), migrations.filter((m) => m.version <= FOLD_VERSION));

  assert.equal(db.getUserVersion(), FOLD_VERSION);
  assert.deepEqual(rows(db, 'SELECT uuid, epoch_day, pose, file_path FROM progress_photo ORDER BY epoch_day'), [
    { uuid: 'pp1', epoch_day: 90, pose: 'side', file_path: 'pp1.enc' },
    { uuid: 'hp1', epoch_day: 100, pose: 'hair', file_path: 'hp1.enc' },
    { uuid: 'hp2', epoch_day: 130, pose: 'hair', file_path: 'hp2.enc' }
  ]);
  for (const table of ['tally_event', 'hair_stage', 'hair_photo']) assert.ok(!tables(db).includes(table), table);
  assert.ok(tables(db).includes('hair_removal_session'));
  assert.deepEqual(rows(db, "SELECT tbl FROM deletion WHERE tbl IN ('tally_event','hair_stage','hair_photo')"), []);
  assert.deepEqual(rows(db, 'SELECT area FROM area_state ORDER BY area'), [{ area: 'hairRemovalSessions' }]);
  assert.deepEqual(rows(db, "SELECT key FROM pref WHERE key = 'hairPhotoProtocolDismissed'"), []);
  /* The library lists the moved photos with the other progress photos. */
  assert.deepEqual(rows(db, "SELECT id, source FROM media_file WHERE id IN ('hp1','hp2','pp1') ORDER BY id"), [
    { id: 'hp1', source: 'progress' },
    { id: 'hp2', source: 'progress' },
    { id: 'pp1', source: 'progress' }
  ]);
  assert.deepEqual(rows(db, "SELECT source FROM media_file WHERE source = 'hair'"), []);
  /* Nothing left in the schema (a view, an index, a trigger) names a dropped table. */
  assert.deepEqual(
    rows(db, "SELECT name FROM sqlite_master WHERE sql LIKE '%hair_photo%' OR sql LIKE '%hair_stage%' OR sql LIKE '%tally_event%'"),
    []
  );
  assert.deepEqual(rows(db, 'PRAGMA integrity_check'), [{ integrity_check: 'ok' }]);
  await db.close();
});

test('the rc.1 released journal reaches 124 with its hair photo as a hair-pose progress photo', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'engender-fold-'));
  const path = join(directory, 'journal.sqlite');
  copyFileSync(RC1_JOURNAL, path);
  const db = makeNodeSqliteDb(path);
  try {
    const hair = rows(db, 'SELECT uuid, epoch_day, file_path FROM hair_photo ORDER BY id');
    assert.equal(hair.length, 1);

    await runMigrations(db, noopFileOps(), migrations.filter((m) => m.version <= FOLD_VERSION));

    assert.equal(db.getUserVersion(), FOLD_VERSION);
    assert.deepEqual(
      rows(db, "SELECT uuid, epoch_day, file_path FROM progress_photo WHERE pose = 'hair' ORDER BY id"),
      hair
    );
    for (const table of ['tally_event', 'hair_stage', 'hair_photo']) assert.ok(!tables(db).includes(table), table);
    assert.deepEqual(rows(db, 'PRAGMA foreign_key_check'), []);
  } finally {
    await db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test('after the first boot a migrated hair photo reads as the hair pose, listed in the library with the progress photos', async () => {
  const db = makeNodeSqliteDb();
  await runMigrations(db, noopFileOps(), migrations.filter((m) => m.version < FOLD_VERSION));
  db.raw.exec("INSERT INTO hair_photo (uuid, epoch_day, file_path, updated_at) VALUES ('hp1', 100, 'hp1.enc', 1000)");
  await runMigrations(db, noopFileOps(), migrations);

  const journal = openJournal(db, fakeFileStore());
  await journal.reconcileBuiltIns();

  assert.deepEqual((await journal.progressPhotos.getPhotos()).map((p) => [p.id, p.pose, p.fileName]), [['hp1', 'hair', 'hp1.enc']]);
  assert.deepEqual((await journal.progressPhotos.getPoses()).map((p) => p.id), ['front', 'side', 'back', 'hair']);
  assert.deepEqual((await journal.photoLibrary.inJournal()).map((p) => [p.id, p.source]), [['hp1', 'progress']]);
  await db.close();
});

test('the migration list carries 124 as a literal', () => {
  assert.ok(migrations.some((m) => m.version === FOLD_VERSION));
});
