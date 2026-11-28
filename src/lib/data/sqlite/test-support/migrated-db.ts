/* Shared by tests that just need a freshly migrated database and don't care
   about the pre-migration file-copy hooks (migration-runner.test.ts does
   care, and keeps its own file-ops spy). */

import { runMigrations } from '../migration-runner.ts';
import { migrations } from '../migrations.ts';
import { makeNodeSqliteDb } from './node-sqlite-driver.ts';
import { noopFileOps } from './noop-file-ops.ts';

/** For tests that need a migrated database and nothing to do with the
    pre-migration copy. Exported because three test-support modules wanted the
    same four no-ops, and a fourth field added to MigrationFileOps should not
    mean editing three copies of it. migration-runner.test.ts keeps its own
    spy: the copy is what that file is about. */
export { noopFileOps };

export async function migratedDb() {
  const db = makeNodeSqliteDb();
  await runMigrations(db, noopFileOps(), migrations);
  return db;
}
