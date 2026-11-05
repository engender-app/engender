/* Version 122: progress photo poses as the person's own list
   (progress-pose-migration.ts). */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { runMigrations } from './migration-runner.ts';
import { migrations } from './migrations.ts';
import { PROGRESS_POSE_VERSION } from './progress-pose-migration.ts';
import { noopFileOps } from './test-support/migrated-db.ts';
import { makeNodeSqliteDb } from './test-support/node-sqlite-driver.ts';

const rows = (db: ReturnType<typeof makeNodeSqliteDb>, sql: string) =>
  db.raw.prepare(sql).all().map((row) => ({ ...(row as object) }));

test('version 122 adds progress_pose and leaves the photos of a journal at 121 as they were', async () => {
  const db = makeNodeSqliteDb();
  await runMigrations(db, noopFileOps(), migrations.filter((m) => m.version < PROGRESS_POSE_VERSION));
  db.raw.exec(
    "INSERT INTO progress_photo (uuid, epoch_day, pose, file_path, updated_at) VALUES ('g1', 12, 'side', 'g1.jpg', 2)"
  );

  await runMigrations(db, noopFileOps(), migrations.filter((m) => m.version <= PROGRESS_POSE_VERSION));

  assert.equal(db.getUserVersion(), PROGRESS_POSE_VERSION);
  assert.deepEqual(rows(db, 'SELECT uuid, pose FROM progress_photo'), [{ uuid: 'g1', pose: 'side' }]);
  assert.deepEqual(rows(db, 'SELECT * FROM progress_pose'), []);
});

test('a deleted pose is recorded for an archive Merge under its domain id', async () => {
  const db = makeNodeSqliteDb();
  await runMigrations(db, noopFileOps(), migrations.filter((m) => m.version <= PROGRESS_POSE_VERSION));
  db.raw.exec(`
    INSERT INTO progress_pose (uuid, key, name, updated_at) VALUES ('u1', NULL, 'Flexing', 1);
    DELETE FROM progress_pose WHERE uuid = 'u1';
  `);
  assert.deepEqual(rows(db, "SELECT tbl, row_key FROM deletion WHERE tbl = 'progress_pose'"), [
    { tbl: 'progress_pose', row_key: 'u1' }
  ]);
});
