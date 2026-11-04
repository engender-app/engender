/* Version 120: progress photos (pre-release-human 12, bug 25). A shot taken
   on purpose in one of three poses gets its own table, joins the media view
   so the library and the orphan sweep both see it, and records its own
   deletion for an archive Merge. */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { runMigrations } from './migration-runner.ts';
import { migrations } from './migrations.ts';
import { noopFileOps } from './test-support/migrated-db.ts';
import { makeNodeSqliteDb } from './test-support/node-sqlite-driver.ts';

test('version 120 adds progress_photo to a journal at 119 and keeps its rows', async () => {
  const db = makeNodeSqliteDb();
  await runMigrations(db, noopFileOps(), migrations.filter((m) => m.version <= 119));
  db.raw.exec("INSERT INTO hair_photo (uuid, epoch_day, file_path, updated_at) VALUES ('h1', 10, 'h1.jpg', 1)");

  await runMigrations(db, noopFileOps(), migrations.filter((m) => m.version <= 120));

  assert.equal(db.getUserVersion(), 120);
  db.raw.exec(
    "INSERT INTO progress_photo (uuid, epoch_day, pose, file_path, updated_at) VALUES ('g1', 12, 'side', 'g1.jpg', 2)"
  );
  const media = db.raw
    .prepare("SELECT id, source, epoch_day, owner_id, source_rank, visible FROM media_file WHERE id IN ('h1', 'g1') ORDER BY id")
    .all()
    .map((row) => ({ ...(row as object) }));
  assert.deepEqual(media, [
    { id: 'g1', source: 'progress', epoch_day: 12, owner_id: 'g1', source_rank: 6, visible: 1 },
    { id: 'h1', source: 'hair', epoch_day: 10, owner_id: 'h1', source_rank: 1, visible: 1 }
  ]);

  db.raw.exec("DELETE FROM progress_photo WHERE uuid = 'g1'");
  const deleted = db.raw.prepare("SELECT tbl, row_key FROM deletion WHERE tbl = 'progress_photo'").all();
  assert.deepEqual(deleted.map((row) => ({ ...(row as object) })), [{ tbl: 'progress_photo', row_key: 'g1' }]);
});
