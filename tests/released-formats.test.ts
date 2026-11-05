import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'vitest';
import { collect } from '../src/lib/data/archive/container.ts';
import { openArchive, packArchive } from '../src/lib/data/archive/pack.ts';
import { portablePreferences } from '../src/lib/data/archive/payload.ts';
import {
  archivePath, countsOf, countsPath, everySectionDevice, GOLDEN_PASSWORD, oneShot
} from '../src/lib/data/journal/golden-archive-fixture.ts';
import { PREFERENCE_DEFAULTS } from '../src/lib/data/prefs/catalogue.ts';
import { runMigrations, type Migration } from '../src/lib/data/sqlite/migration-runner.ts';
import { migrations } from '../src/lib/data/sqlite/migrations.ts';
import { LATEST_SCHEMA_VERSION } from '../src/lib/data/sqlite/schema-version.ts';
import { noopFileOps } from '../src/lib/data/sqlite/test-support/migrated-db.ts';
import { makeNodeSqliteDb } from '../src/lib/data/sqlite/test-support/node-sqlite-driver.ts';
import { restoreArchive, verifyArchive } from '../src/lib/data/journal/restore.ts';
import { DROPPED_ARCHIVE_SECTION_NAMES, emptyArchiveJournal } from '../src/lib/data/journal/archiveSections.ts';
import { fakeFileStore } from '../src/lib/data/photos/test-support/fake-file-store.ts';
import { migratedDb } from '../src/lib/data/sqlite/test-support/migrated-db.ts';

const releasedRoot = fileURLToPath(new URL('../fixtures/released/', import.meta.url));

test('rc.1 archive without a writer stamp still verifies and restores', async () => {
  const fresh = await openArchive((async function* () {
    yield await collect(packArchive({
      journal: emptyArchiveJournal(), preferences: portablePreferences(PREFERENCE_DEFAULTS), files: [],
      readFile: async () => new Uint8Array()
    }, GOLDEN_PASSWORD, { memorySize: 256, iterations: 1, parallelism: 1, hashLength: 32 }));
  })(), GOLDEN_PASSWORD);
  assert.ok(fresh.payload.writer);
  const bytes = new Uint8Array(readFileSync(join(releasedRoot, '1.0.0-rc.1', 'archive.ttbackup')));
  const opened = await openArchive((async function* () { yield bytes; })(), GOLDEN_PASSWORD);
  assert.equal(opened.payload.writer, undefined);
  await verifyArchive((async function* () { yield bytes; })(), GOLDEN_PASSWORD);
  const driver = await migratedDb();
  try {
    await restoreArchive(driver, fakeFileStore(), 'replace', {
      journal: opened.payload.journal, files: opened.files
    });
  } finally {
    await driver.close();
  }
});
/* Tables the functional audit's cuts drop before 1.0 (spec: "cut means
   removed"). Their rows go with the migration, so a released fixture's count
   for them is checked as gone rather than kept. */
const DROPPED_TABLES = new Set(['saved_question', 'doubt_snapshot', 'doubt_snapshot_entry', 'measurement', 'measurement_type', 'size_record', 'affirmation', 'revisit', 'word_frequency_ignore', 'journaling_pause', 'roadmap_track']);

interface ReleasedCounts {
  archiveSections: Record<string, number>;
  sqliteTables: Record<string, number>;
}

async function checkReleasedFixture(directory: string, chain: Migration[] = migrations): Promise<void> {
  assert.deepEqual(readdirSync(directory).sort(), ['archive.ttbackup', 'counts.json', 'journal.sqlite']);
  const counts: ReleasedCounts = JSON.parse(readFileSync(join(directory, 'counts.json'), 'utf8'));
  const opened = await openArchive(oneShot(new Uint8Array(readFileSync(join(directory, 'archive.ttbackup')))), GOLDEN_PASSWORD);
  const archiveCounts = countsOf(opened.payload.journal);
  for (const [section, expected] of Object.entries(counts.archiveSections)) {
    if (DROPPED_ARCHIVE_SECTION_NAMES.includes(section)) continue;
    assert.equal(archiveCounts[section], expected, `released archive section ${section}`);
  }
  let filesRead = 0;
  for await (const file of opened.files) {
    assert.equal(file.bytes.length, opened.payload.files[filesRead].length);
    filesRead += 1;
  }
  assert.equal(filesRead, opened.payload.files.length);

  // Migrate a disposable copy. The committed database must never change.
  const temporary = mkdtempSync(join(tmpdir(), 'engender-released-'));
  const path = join(temporary, 'journal.sqlite');
  copyFileSync(join(directory, 'journal.sqlite'), path);
  const driver = makeNodeSqliteDb(path);
  try {
    await runMigrations(driver, noopFileOps(), chain);
    assert.equal(await driver.getUserVersion(), Math.max(...chain.map((migration) => migration.version)));
    for (const [table, expected] of Object.entries(counts.sqliteTables)) {
      if (DROPPED_TABLES.has(table)) {
        const [gone] = await driver.query<{ n: number }>("SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name = ?", [table]);
        assert.equal(gone.n, 0, `released SQLite table ${table} was dropped by a cut`);
        continue;
      }
      const [row] = await driver.query<{ n: number }>(`SELECT COUNT(*) AS n FROM "${table.replaceAll('"', '""')}"`);
      /* Rows a cut dropped from a table it kept: area states naming a
         dropped section, and the felt-sense readings that hung off a
         milestone (functional audit ticket 32, migration 98). The archive
         is the same journal, so it says how many those were. */
      const droppedRows = table === 'area_state'
        ? opened.payload.journal.areaStates.filter((state) => DROPPED_ARCHIVE_SECTION_NAMES.includes(state.area)).length
        : table === 'felt_sense'
          ? opened.payload.journal.feltSenseEntries.filter((entry) => (entry as { milestoneId?: string | null }).milestoneId != null).length
          : 0;
      /* Pre-release-human 12 split genital_sexual into genital and sexual
         (migration 121): one category row in, two out. */
      const splitRows = table === 'effect_category'
        && opened.payload.journal.effectCategories.some((category) => (category as { key?: string }).key === 'genital_sexual') ? 1 : 0;
      assert.equal(row.n, expected - droppedRows + splitRows, `released SQLite table ${table}`);
    }
    assert.deepEqual(await driver.query('PRAGMA integrity_check'), [{ integrity_check: 'ok' }]);
    assert.deepEqual(await driver.query('PRAGMA foreign_key_check'), []);
  } finally {
    await driver.close();
    rmSync(temporary, { recursive: true, force: true });
  }
}

// Run only at the release candidate. Existing version directories cannot be overwritten.
if (process.env.WRITE_RELEASED_FORMAT) {
  test('writes the release candidate fixtures once', async () => {
    const version = process.env.WRITE_RELEASED_FORMAT!;
    assert.match(version, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);
    const directory = join(releasedRoot, version);
    mkdirSync(directory);
    const { driver, journal } = await everySectionDevice();
    try {
      const snapshot = await journal.archive.snapshot();
      const archive = await collect(packArchive({
        ...snapshot, preferences: portablePreferences(PREFERENCE_DEFAULTS)
      }, GOLDEN_PASSWORD));
      writeFileSync(join(directory, 'archive.ttbackup'), archive, { flag: 'wx' });
      await driver.exec(`VACUUM INTO '${join(directory, 'journal.sqlite').replaceAll("'", "''")}'`);
      const tables = await driver.query<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
      const sqliteTables: Record<string, number> = {};
      for (const { name } of tables) {
        const [row] = await driver.query<{ n: number }>(`SELECT COUNT(*) AS n FROM "${name.replaceAll('"', '""')}"`);
        sqliteTables[name] = row.n;
      }
      const counts: ReleasedCounts = { archiveSections: countsOf(snapshot.journal), sqliteTables };
      writeFileSync(join(directory, 'counts.json'), `${JSON.stringify(counts, null, 2)}\n`, { flag: 'wx' });
      await checkReleasedFixture(directory);
    } finally {
      await driver.close();
    }
  });
}

function requireReleasedFixtures(tags: string[], directories: string[]): void {
  assert.ok(directories.length > 0, 'No released-format fixtures found');
  for (const tag of tags) {
    if (!tag.startsWith('v') || /-alpha(?:[.-]|$)/.test(tag)) continue;
    assert.ok(directories.includes(tag.slice(1)), `Missing released-format fixture for ${tag}`);
  }
}

test('every non-alpha release tag has a fixture and every released format preserves rows', async () => {
  const tags = execFileSync('git', ['tag', '--list', 'v*'], {
    cwd: releasedRoot, encoding: 'utf8'
  }).trim().split('\n').filter(Boolean);
  const directories = readdirSync(releasedRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  requireReleasedFixtures(tags, directories);
  for (const directory of directories) await checkReleasedFixture(join(releasedRoot, directory));
});

test('release coverage refuses empty and missing fixtures but excludes alpha tags', () => {
  assert.throws(() => requireReleasedFixtures(['v1.0.0-rc.1'], []), /No released-format fixtures/);
  assert.throws(() => requireReleasedFixtures(['v1.0.0-rc.1', 'v1.0.0'], ['1.0.0-rc.1']),
    /Missing released-format fixture for v1.0.0/);
  requireReleasedFixtures(['v1.0.0-alpha.1', 'v1.0.0-rc.1'], ['1.0.0-rc.1']);
});

test('the rc.1 fixture detects a row-deleting first step after 88', async () => {
  /* The step after the baseline is the squash of 89 to 119 (pre-publish
     ticket 01), the one an rc.1 journal takes on update. */
  const directory = join(releasedRoot, '1.0.0-rc.1');
  const original = readFileSync(join(directory, 'journal.sqlite'));
  assert.equal(original.readUInt32BE(60), 88);
  const mutant = migrations.map((migration) => migration.version === 119
    ? { ...migration, sql: `${migration.sql}\nDELETE FROM entry;` }
    : migration);
  assert.ok(mutant.some((migration) => migration.version === 119));
  await assert.rejects(checkReleasedFixture(directory, mutant),
    /Foreign key violations after migration|released SQLite table entry/);
  assert.deepEqual(readFileSync(join(directory, 'journal.sqlite')), original);
});

test('the released-format harness catches row loss and leaves fixture bytes untouched', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'engender-fixture-test-'));
  const driver = makeNodeSqliteDb();
  try {
    await runMigrations(driver, noopFileOps(), migrations);
    assert.equal(await driver.getUserVersion(), LATEST_SCHEMA_VERSION);
    copyFileSync(archivePath, join(directory, 'archive.ttbackup'));
    await driver.run("INSERT INTO entry (uuid, epoch_day, timestamp, mood, note, updated_at) VALUES ('released-entry', 20000, 0, 3, '', 0)");
    await driver.exec(`VACUUM INTO '${join(directory, 'journal.sqlite').replaceAll("'", "''")}'`);
    const original = readFileSync(join(directory, 'journal.sqlite'));
    const counts: ReleasedCounts = {
      archiveSections: JSON.parse(readFileSync(countsPath, 'utf8')), sqliteTables: { entry: 1 }
    };
    const writeCounts = () => writeFileSync(join(directory, 'counts.json'), JSON.stringify(counts));
    writeCounts();
    await checkReleasedFixture(directory);
    assert.deepEqual(readFileSync(join(directory, 'journal.sqlite')), original);
    counts.archiveSections.entries += 1;
    writeCounts();
    await assert.rejects(checkReleasedFixture(directory), /released archive section entries/);
    counts.archiveSections.entries -= 1;
    writeCounts();
    const damaged = makeNodeSqliteDb(join(directory, 'journal.sqlite'));
    try {
      await damaged.run("DELETE FROM entry WHERE uuid = 'released-entry'");
    } finally {
      await damaged.close();
    }
    await assert.rejects(checkReleasedFixture(directory), /released SQLite table entry/);
  } finally {
    await driver.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
