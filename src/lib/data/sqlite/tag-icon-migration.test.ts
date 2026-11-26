/* Version 125: a tag can carry an icon (tag-icon-migration.ts). */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { runMigrations } from './migration-runner.ts';
import { migrations } from './migrations.ts';
import { noopFileOps } from './test-support/migrated-db.ts';
import { makeNodeSqliteDb } from './test-support/node-sqlite-driver.ts';
import { TAG_ICON_VERSION } from './tag-icon-migration.ts';

test('version 125 gives every tag an icon column, empty on the rows already there', async () => {
  const db = makeNodeSqliteDb();
  await runMigrations(db, noopFileOps(), migrations.filter((m) => m.version < 125));
  db.raw.exec(`INSERT INTO tag_group (key, name, updated_at) VALUES ('g', 'Group', 1);
    INSERT INTO tag (uuid, group_id, label, updated_at) SELECT 'own', id, 'mine', 1 FROM tag_group WHERE key = 'g';`);

  await runMigrations(db, noopFileOps(), migrations);

  assert.equal(db.getUserVersion(), 125);
  assert.deepEqual({ ...(db.raw.prepare("SELECT label, icon FROM tag WHERE uuid = 'own'").get() as object) }, { label: 'mine', icon: null });
  db.raw.exec("UPDATE tag SET icon = 'dumbbell' WHERE uuid = 'own'");
  assert.equal((db.raw.prepare("SELECT icon FROM tag WHERE uuid = 'own'").get() as { icon: string }).icon, 'dumbbell');
  await db.close();
});

test('the migration list carries 125 as a literal, the same number the module exports', () => {
  assert.equal(TAG_ICON_VERSION, 125);
  assert.ok(migrations.some((m) => m.version === 125));
});
