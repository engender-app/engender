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

const releasedRoot = fileURLToPath(new URL('../fixtures/released/', import.meta.url));
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
      const [row] = await driver.query<{ n: number }>(`SELECT COUNT(*) AS n FROM "${table.replaceAll('"', '""')}"`);
      assert.equal(row.n, expected, `released SQLite table ${table}`);
    }
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

test('the rc.1 fixture detects a row-deleting migration 90', async () => {
  const directory = join(releasedRoot, '1.0.0-rc.1');
  const original = readFileSync(join(directory, 'journal.sqlite'));
  assert.equal(original.readUInt32BE(60), 88);
  const mutant = migrations.map((migration) => migration.version === 90
    ? { ...migration, sql: `${migration.sql}\nDELETE FROM entry;` }
    : migration);
  assert.ok(mutant.some((migration) => migration.version === 90));
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
