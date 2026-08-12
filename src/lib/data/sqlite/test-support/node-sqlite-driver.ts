/* Test-only SqliteDriver backed by node:sqlite's DatabaseSync. The real
   drivers need a browser (sqlite3mc over OPFS) or an Android shell (SQLCipher
   behind a local Capacitor plugin), so this is what lets the Node tier run
   journal SQL at all - and it gives the driver seam its second adapter,
   which is what makes the seam real rather than hypothetical (ADR-0017).

   node:sqlite is synchronous; the driver interface is uniformly async, so
   every method here wraps a synchronous call in an async signature. */

import { DatabaseSync } from 'node:sqlite';
import type { SqliteDriver } from '../driver.ts';

export function makeNodeSqliteDb(): SqliteDriver & { raw: DatabaseSync } {
  const raw = new DatabaseSync(':memory:');
  return {
    raw,
    exec(sql: string) {
      raw.exec(sql);
    },
    async query<Row extends Record<string, unknown> = Record<string, unknown>>(
      sql: string,
      params: unknown[] = []
    ) {
      return raw.prepare(sql).all(...(params as never[])) as Row[];
    },
    async run(sql: string, params: unknown[] = []) {
      const result = raw.prepare(sql).run(...(params as never[]));
      return { changes: Number(result.changes), lastInsertRowid: Number(result.lastInsertRowid) };
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
    },
    async close() {
      raw.close();
    }
  };
}
