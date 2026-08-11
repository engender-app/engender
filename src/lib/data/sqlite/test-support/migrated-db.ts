/* Shared by tests that just need a freshly migrated database and don't care
   about the pre-migration file-copy hooks (migration-runner.test.ts does
   care, and keeps its own file-ops spy). */

import { runMigrations } from '../migration-runner.ts';
import { migrations } from '../migrations.ts';
import { makeNodeSqliteDb } from './node-sqlite-driver.ts';

function noopFileOps() {
  return { copyDatabaseFile() {}, cleanupPreMigrationCopy() {} };
}

export async function migratedDb() {
  const db = makeNodeSqliteDb();
  await runMigrations(db, noopFileOps(), migrations);
  return db;
}
