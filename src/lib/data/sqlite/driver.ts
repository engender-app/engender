/* The one driver interface both platforms satisfy (ticket 04): SQLocal over
   OPFS on web, @capacitor-community/sqlite on Android (comes with the
   Capacitor shell later). No OPFS or worker concept appears here - only
   SQL in, rows out, so a repository (ticket 07) never needs to know which
   platform it's talking to.

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
