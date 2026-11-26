import assert from 'node:assert/strict';
import { test } from 'vitest';
import { ARCHIVE_SECTION_NAMES, DROPPED_ARCHIVE_SECTION_NAMES, emptyArchiveJournal } from '../src/lib/data/journal/archiveSections.ts';
import { ENTRY_TEMPLATES_DROP_VERSION } from '../src/lib/data/sqlite/entry-templates-drop-migration.ts';
import { migratedDb, noopFileOps } from '../src/lib/data/sqlite/test-support/migrated-db.ts';
import { makeNodeSqliteDb } from '../src/lib/data/sqlite/test-support/node-sqlite-driver.ts';

const TEMPLATE_TABLES = ['entry_template', 'entry_template_tag', 'entry_template_dimension_value'];

test('migration 123 drops the saved templates and keeps every entry', async () => {
  const { runMigrations } = await import('../src/lib/data/sqlite/migration-runner.ts');
  const { migrations } = await import('../src/lib/data/sqlite/migrations.ts');
  const db = makeNodeSqliteDb();
  try {
    await runMigrations(db, noopFileOps(), migrations.filter((m) => m.version < ENTRY_TEMPLATES_DROP_VERSION));
    await db.run("INSERT INTO entry_template (uuid, name, note_scaffold, updated_at) VALUES ('t-1', 'Mine', 'Today I', 1)");
    await db.run("INSERT INTO entry_template_tag (template_id, tag_id) SELECT 1, id FROM tag LIMIT 1");
    await db.run("INSERT INTO entry (uuid, epoch_day, timestamp, note, updated_at) VALUES ('e-1', 20000, 0, 'Today I felt fine', 1)");
    await db.run('DELETE FROM entry_template WHERE uuid = ?', ['t-1']);
    await db.run("INSERT INTO entry_template (uuid, name, updated_at) VALUES ('t-2', 'Other', 1)");
    await runMigrations(db, noopFileOps(), migrations);
    assert.equal(await db.getUserVersion(), ENTRY_TEMPLATES_DROP_VERSION);
    const tables = await db.query<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table'");
    for (const table of TEMPLATE_TABLES) assert.ok(!tables.some((row) => row.name === table), table);
    assert.deepEqual(await db.query("SELECT tbl FROM deletion WHERE tbl = 'entry_template'"), []);
    assert.deepEqual(await db.query('SELECT uuid, note FROM entry'), [{ uuid: 'e-1', note: 'Today I felt fine' }]);
  } finally {
    await db.close();
  }
});

test('the migration list carries 123 for the drop, as the constant says', async () => {
  const { migrations } = await import('../src/lib/data/sqlite/migrations.ts');
  const { ENTRY_TEMPLATES_DROP } = await import('../src/lib/data/sqlite/entry-templates-drop-migration.ts');
  assert.equal(migrations.find((m) => m.sql === ENTRY_TEMPLATES_DROP)?.version, ENTRY_TEMPLATES_DROP_VERSION);
});

test('entryTemplates is no longer a section but older archives that carry it are read', () => {
  assert.ok(!ARCHIVE_SECTION_NAMES.includes('entryTemplates' as never));
  assert.ok(DROPPED_ARCHIVE_SECTION_NAMES.includes('entryTemplates'));
});

for (const mode of ['replace', 'merge'] as const) {
  test(`an older archive carrying templates restores by ${mode} and ignores them`, async () => {
    const { restoreArchive } = await import('../src/lib/data/journal/restore.ts');
    const { fakeFileStore } = await import('../src/lib/data/photos/test-support/fake-file-store.ts');
    const db = await migratedDb();
    try {
      const journal = {
        ...emptyArchiveJournal(),
        entryTemplates: [
          { id: 'euphoria_day', name: '', tags: ['g-euphoria'], dims: { euphoria_dysphoria: 90 }, noteScaffold: '', presentationId: null, builtIn: true, hidden: false, updatedAt: 1 },
          { id: 'tpl-own', name: 'Mine', tags: [], dims: {}, noteScaffold: 'Today I', presentationId: null, builtIn: false, hidden: false, updatedAt: 1 }
        ],
        areaStates: [
          { area: 'entryTemplates', hidden: true, finishedEpochDay: null, suspendedEpochDay: null },
          { area: 'hairStages', hidden: true, finishedEpochDay: null, suspendedEpochDay: null }
        ],
        deletions: [{ table: 'entry_template', id: 'tpl-gone', deletedAt: 5 }]
      };
      await restoreArchive(db, fakeFileStore(), mode, { journal: journal as never, preferences: {} as never, files: (async function* () {})() });
      const tables = await db.query<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table'");
      for (const table of TEMPLATE_TABLES) assert.ok(!tables.some((row) => row.name === table), table);
      assert.deepEqual(await db.query('SELECT area FROM area_state'), [{ area: 'hairStages' }]);
      assert.deepEqual(await db.query("SELECT row_key FROM deletion WHERE tbl = 'entry_template'"), []);
    } finally {
      await db.close();
    }
  });
}
