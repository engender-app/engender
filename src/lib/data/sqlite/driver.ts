/* The one driver interface every platform satisfies: sqlite3mc over a wrapped
   OPFS SAHPool VFS on web, and a local Capacitor plugin over
   net.zetetic:sqlcipher-android on Android (both ADR-0020). No OPFS, worker or
   bridge concept appears here - only SQL in, rows out, so a repository never
   needs to know which platform it's talking to.

   Extends MigrationDb (migration-runner.ts) rather than duplicating it, so
   the same driver that opens the database also runs its migrations. */

import type { MigrationDb } from './migration-runner.ts';

export interface SqliteDriver extends MigrationDb {
  /** Runs a parameterized query and returns its result rows. */
  query<Row extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    params?: unknown[]
  ): Promise<Row[]>;
  /** Runs a parameterized statement that doesn't return rows. */
  run(sql: string, params?: unknown[]): Promise<{ changes: number; lastInsertRowid: number }>;
  /** Disconnects from the database and releases its resources. */
  close(): Promise<void>;
}
