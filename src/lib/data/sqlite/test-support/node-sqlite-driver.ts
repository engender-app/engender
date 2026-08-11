/* Test-only MigrationDb backed by node:sqlite's DatabaseSync. No production
   SQLite driver is wired in yet (ticket 04 - SQLocal on web, Capacitor on
   Android); this exists purely so migration-runner and schema tests can run
   against a real SQLite engine without one. */

import { DatabaseSync } from 'node:sqlite';
import type { MigrationDb } from '../migration-runner.ts';

export function makeNodeSqliteDb(): MigrationDb & { raw: DatabaseSync } {
  const raw = new DatabaseSync(':memory:');
  return {
    raw,
    exec(sql: string) {
      raw.exec(sql);
    },
    getUserVersion() {
      return (raw.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;
    },
    setUserVersion(version: number) {
      raw.exec(`PRAGMA user_version = ${version}`);
    },
    async transaction<T>(fn: () => T | Promise<T>): Promise<T> {
      raw.exec('BEGIN');
      try {
        const result = await fn();
        raw.exec('COMMIT');
        return result;
      } catch (err) {
        raw.exec('ROLLBACK');
        throw err;
      }
    }
  };
}
