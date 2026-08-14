/* The web half of ticket 04: a SqliteDriver (driver.ts) and a
   MigrationFileOps (migration-runner.ts), both backed by SQLocal over OPFS
   (PRD's Tech Stack § Data and platform services). The only file allowed
   to mention SQLocal, OPFS or workers - everything downstream talks to
   those two platform-neutral interfaces.

   Both come from one composition root, createWebSqlite(), rather than two
   independent factories, because the pre-migration file copy has to read
   the *same* database OPFS is holding open for the driver - a second
   SQLocal client opened on the same path would fight it for the OPFS sync
   access handle. The backup itself lives at its own path, so it gets its
   own client.

   Transactions are implemented as manual BEGIN/COMMIT/ROLLBACK over the
   same `sql` calls exec/query/run use, rather than SQLocal's own tx-scoped
   `transaction()` helper: migration-runner.ts's callback calls back into
   the driver's own exec/setUserVersion (not a separate transaction
   handle), and SQLocal serializes every call through one worker
   connection, so manual BEGIN/COMMIT/ROLLBACK composes correctly with that
   - verified directly against a running SQLocal instance. */

import { SQLocal } from 'sqlocal';
import type { SqliteDriver } from './driver.ts';
import type { MigrationFileOps } from './migration-runner.ts';

export interface WebSqlite {
  driver: SqliteDriver;
  fileOps: MigrationFileOps;
  /** Requests persistent storage so OPFS isn't subject to eviction (PRD).
      Resolves to whether it was granted. */
  requestPersistentStorage: () => Promise<boolean>;
}

export function createWebSqlite(databasePath: string): WebSqlite {
  const primary = new SQLocal(databasePath);
  const backupPath = `${databasePath}.pre-migration-backup`;
  const backup = new SQLocal(backupPath);
  const { sql } = primary;

  const driver: SqliteDriver = {
    async exec(statements: string) {
      await sql(statements);
    },

    async query<Row extends Record<string, unknown> = Record<string, unknown>>(
      statement: string,
      params: unknown[] = []
    ) {
      return sql<Row>(statement, ...params);
    },

    async run(statement: string, params: unknown[] = []) {
      await sql(statement, ...params);
      const [meta] = await sql<{ lastInsertRowid: number; changes: number }>(
        'SELECT last_insert_rowid() AS lastInsertRowid, changes() AS changes'
      );
      return meta;
    },

    async getUserVersion() {
      const [row] = await sql<{ user_version: number }>('PRAGMA user_version');
      return row.user_version;
    },

    async setUserVersion(version: number) {
      // PRAGMA does not accept a bound parameter, and version numbers here
      // only ever come from this codebase's own migrations array.
      await sql(`PRAGMA user_version = ${version}`);
    },

    async transaction<T>(fn: () => T | Promise<T>): Promise<T> {
      await sql('BEGIN');
      try {
        const result = await fn();
        await sql('COMMIT');
        return result;
      } catch (err) {
        await sql('ROLLBACK');
        throw err;
      }
    },

    async close() {
      await primary.destroy();
      await backup.destroy();
    }
  };

  const fileOps: MigrationFileOps = {
    async preMigrationCopyIsUsable() {
      /* SQLocal creates the backup path on construction and deleting it leaves
         an empty database behind, so the question is whether the file holds a
         schema rather than whether it is there at all. */
      const [row] = await backup.sql<{ tables: number }>(
        "SELECT count(*) AS tables FROM sqlite_master WHERE type = 'table'"
      );
      return row.tables > 0;
    },
    async copyDatabaseFile() {
      // VACUUM INTO keeps the copy in SQLite space and avoids SQLocal's
      // worker export messaging path on Android WebView.
      await backup.deleteDatabaseFile();
      await sql(`VACUUM INTO '${backupPath.replace(/'/g, "''")}'`);
    },
    async restorePreMigrationCopy() {
      const file = await backup.getDatabaseFile();
      await primary.overwriteDatabaseFile(file);
    },
    async cleanupPreMigrationCopy() {
      await backup.deleteDatabaseFile();
    }
  };

  async function requestPersistentStorage(): Promise<boolean> {
    if (!navigator.storage?.persist) return false;
    return navigator.storage.persist();
  }

  return { driver, fileOps, requestPersistentStorage };
}

/** A read-only view of a Journal from before encryption, for the one thing
    that still needs one: converting it (ticket 10). ADR-0020 replaced this
    driver, and the app never opens a plaintext database again - but the
    conversion has to read one, and this file stays the only place that
    knows SQLocal exists.

    Read-only in intent rather than by a flag: `sql` is here because the
    conversion counts the rows it is about to copy so it can count them
    again on the other side, and because opening the database is what
    applies a rollback journal a killed write left behind. The bytes that
    come out are therefore a consistent database rather than a snapshot of
    one mid-transaction, which is the reason to go through SQLocal at all
    instead of reading the OPFS file directly. */
export interface PlaintextEraJournal {
  query<Row extends Record<string, unknown>>(statement: string, params?: unknown[]): Promise<Row[]>;
  /** The whole database file, as SQLocal's own VFS sees it. */
  readDatabaseFile(): Promise<Uint8Array<ArrayBuffer>>;
  /** Lets go of the OPFS handle, which is what has to happen before the
      file can be deleted or the SAHPool worker can take over. */
  close(): Promise<void>;
}

export function openPlaintextEraJournal(databasePath: string): PlaintextEraJournal {
  const client = new SQLocal(databasePath);

  return {
    query: (statement, params = []) => client.sql(statement, ...params) as never,
    async readDatabaseFile() {
      return new Uint8Array(await (await client.getDatabaseFile()).arrayBuffer());
    },
    close: () => client.destroy()
  };
}
