/* A failed migration on Android, end to end through the driver.

   Boot() closes the driver when a migration fails, and the plugin's CallSequencer refuses
   every later call on a closed session. The failure screen's two file operations - asking
   whether the pre-migration copy is usable, and putting it back - come after that close, so
   on the closed session they were refused, the check's refusal read as "no copy", and the
   restore was never offered although a usable copy sat on disk.

   The plugin here is the Node stand-in that keeps CallSequencer's rules and real files
   (test-support/fake-sqlite-plugin.ts). The failing migration is testing 06's: a step that
   deletes a parent row, so the foreign-key check after it throws once the migration has
   committed. */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { createFakeSqlitePlugin, type FakeSqlitePlugin } from './test-support/fake-sqlite-plugin.ts';

/* registerPlugin runs once, when android-driver.ts loads, so the mock hands
   back a stand-in that forwards to whichever fake the test made last. */
const plugin = vi.hoisted(() => ({ current: null as unknown as Record<string, (options: unknown) => unknown> }));
vi.mock('@capacitor/core', () => ({
  registerPlugin: () => new Proxy({}, { get: (_target, method: string) => (options: unknown) => plugin.current[method](options) })
}));

const { createAndroidSqlite } = await import('./android-driver.ts');
const { boot } = await import('./boot.ts');
const { runMigrations } = await import('./migration-runner.ts');

const SCHEMA = `
  CREATE TABLE milestone (id INTEGER PRIMARY KEY, title TEXT NOT NULL);
  CREATE TABLE photo (id INTEGER PRIMARY KEY, milestone_id INTEGER NOT NULL REFERENCES milestone(id));
`;
const migrations = [
  { version: 1, sql: SCHEMA },
  { version: 2, sql: 'DELETE FROM milestone WHERE id = (SELECT MIN(id) FROM milestone);' }
];

let dir: string;
let fake: FakeSqlitePlugin;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ui33-'));
  fake = createFakeSqlitePlugin(dir);
  plugin.current = fake as never;

  // The journal as the previous release left it: schema 1, rows that a
  // milestone delete orphans.
  const seed = new DatabaseSync(fake.pathOf('journal'));
  seed.exec(SCHEMA);
  seed.exec("INSERT INTO milestone (id, title) VALUES (1, 'first'), (2, 'second')");
  seed.exec('INSERT INTO photo (id, milestone_id) VALUES (10, 1), (11, 2)');
  seed.exec('PRAGMA user_version = 1');
  seed.close();
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

async function failedBoot() {
  const sqlite = createAndroidSqlite('journal');
  const result = await boot({
    createDriver: () => sqlite.driver,
    fileOps: sqlite.fileOps,
    prepareDatabase: (driver, fileOps) => runMigrations(driver, fileOps, migrations)
  });
  return { sqlite, result };
}

const counts = (path: string) => {
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    return {
      version: (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version,
      milestones: (db.prepare('SELECT count(*) AS n FROM milestone').get() as { n: number }).n,
      photos: (db.prepare('SELECT count(*) AS n FROM photo').get() as { n: number }).n
    };
  } finally {
    db.close();
  }
};

test('after a failed migration closes the session, the copy still reads as usable', async () => {
  const { sqlite, result } = await failedBoot();

  expect(result.phase).toBe('error');
  expect(String((result as { error: unknown }).error)).toMatch(/Foreign key violations after migration/);
  // boot() closed the driver on the way out, and the plugin now refuses that session.
  expect(fake.calls.some((call) => call.method === 'close' && !call.refused)).toBe(true);

  await expect(sqlite.fileOps.preMigrationCopyIsUsable()).resolves.toBe(true);
});

test('restoring the copy after the failure brings back the journal the update started from', async () => {
  const { sqlite } = await failedBoot();
  expect(counts(fake.pathOf('journal'))).toEqual({ version: 2, milestones: 1, photos: 2 });

  expect(await sqlite.fileOps.preMigrationCopyIsUsable()).toBe(true);
  await sqlite.fileOps.restorePreMigrationCopy();

  expect(counts(fake.pathOf('journal'))).toEqual({ version: 1, milestones: 2, photos: 2 });
});

test('the failure screen still hears "no copy" when there is none', async () => {
  const sqlite = createAndroidSqlite('journal');
  await sqlite.driver.getUserVersion();
  await sqlite.driver.close();

  await expect(sqlite.fileOps.preMigrationCopyIsUsable()).resolves.toBe(false);
});

test('a driver that is still open keeps its file operations in its own sequence', async () => {
  const sqlite = createAndroidSqlite('journal');
  await sqlite.fileOps.copyDatabaseFile();
  expect(await sqlite.fileOps.preMigrationCopyIsUsable()).toBe(true);

  const [open, copy, check] = fake.calls;
  expect([open.method, copy.method, check.method]).toEqual(['open', 'copyDatabaseFile', 'preMigrationCopyIsUsable']);
  expect(new Set([open.session, copy.session, check.session]).size).toBe(1);
  expect([open.seq, copy.seq, check.seq]).toEqual([0, 1, 2]);
});
