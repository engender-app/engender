import { test } from 'vitest';
import assert from 'node:assert/strict';
import { runMigrations } from './migration-runner.ts';
import { migrations } from './migrations.ts';
import { noopFileOps } from './test-support/migrated-db.ts';
import { makeNodeSqliteDb } from './test-support/node-sqlite-driver.ts';

test('migration drops cut tryout kinds and children but keeps linked milestones', async () => {
  const db = makeNodeSqliteDb();
  try {
    await runMigrations(db, noopFileOps(), migrations.filter((step) => step.version <= 98));
    db.raw.exec(`
      INSERT INTO tryout (uuid, kind, label, start_epoch_day, updated_at) VALUES
        ('kept', 'name', 'Alex', 1, 1),
        ('garment', 'garment', 'Coat', 1, 1),
        ('step', 'presentation_step', 'First outing', 1, 1);
      INSERT INTO milestone (uuid, name, epoch_day, tryout_id, updated_at) VALUES
        ('kept-milestone', 'Name', 1, 'kept', 1),
        ('garment-milestone', 'Coat', 1, 'garment', 1),
        ('step-milestone', 'Outing', 1, 'step', 1);
      INSERT INTO felt_sense (uuid, tryout_id, epoch_day, mood, updated_at)
        SELECT 'old-feeling', id, 1, 3, 1 FROM tryout WHERE uuid = 'garment';
      INSERT INTO tryout_photo (uuid, tryout_id, epoch_day, file_path, updated_at)
        SELECT 'old-photo', id, 1, 'coat.jpg', 1 FROM tryout WHERE uuid = 'step';
    `);

    await runMigrations(db, noopFileOps(), migrations);

    assert.deepEqual(db.raw.prepare('SELECT uuid FROM tryout ORDER BY uuid').all().map((row: any) => row.uuid), ['kept']);
    assert.deepEqual(db.raw.prepare('SELECT uuid, tryout_uuid FROM milestone ORDER BY uuid').all().map((row: any) => ({ ...row })), [
      { uuid: 'garment-milestone', tryout_uuid: null },
      { uuid: 'kept-milestone', tryout_uuid: 'kept' },
      { uuid: 'step-milestone', tryout_uuid: null }
    ]);
    assert.equal((db.raw.prepare('SELECT COUNT(*) AS n FROM felt_sense').get() as { n: number }).n, 0);
    assert.equal((db.raw.prepare('SELECT COUNT(*) AS n FROM tryout_photo').get() as { n: number }).n, 0);
    assert.deepEqual(db.raw.prepare('PRAGMA foreign_key_check').all(), []);
  } finally {
    await db.close();
  }
});
