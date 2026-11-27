/* Version 125: a tag can carry an icon (tag-icon-migration.ts). */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { openJournal } from '../journal/journal.ts';
import { fakeFileStore } from '../photos/test-support/fake-file-store.ts';
import en from '../../../../messages/en.json';
import { tagIdsMatching } from '../searchQuery.ts';
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

test('an anxious entry saved at version 124 keeps its tag in entry, search and stats reads', async () => {
  const db = makeNodeSqliteDb();
  try {
    await runMigrations(db, noopFileOps(), migrations.filter((m) => m.version < TAG_ICON_VERSION));
    db.raw.exec(`
      INSERT INTO tag_group (key, name, updated_at) VALUES ('emotions', '', 0);
      INSERT INTO tag (key, group_id, label, updated_at) VALUES ('e-anxious', 1, '', 0);
    `);
    const journal = openJournal(db, fakeFileStore());
    const id = await journal.entries.upsertEntry({ epochDay: 100, mood: 3, tags: ['e-anxious'] });

    await runMigrations(db, noopFileOps(), migrations);
    await journal.reconcileBuiltIns();

    const labels = new Map([['e-anxious', en.tag_e_anxious]]);
    const entry = await journal.entries.getEntry(id);
    assert.deepEqual(entry?.tags.map((tag) => labels.get(tag)), ['anxious']);
    const matches = tagIdsMatching('anxious', [{ id: 'e-anxious', label: en.tag_e_anxious }]);
    const hits = await journal.entries.searchEntries('anxious', matches);
    assert.deepEqual(hits.map((entry) => entry.id), [id]);
    const share = await journal.stats.tagShare(100, 100);
    assert.deepEqual(share.map(({ id, count }) => ({ label: labels.get(id), count })), [{ label: 'anxious', count: 1 }]);
  } finally {
    await db.close();
  }
});
