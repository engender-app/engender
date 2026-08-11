/* Shared plumbing for the journal's area modules. Not exported past the
   journal: everything here is about rows, and rows stay behind the seam. */

import type { SqliteDriver } from '../sqlite/driver';

export const mintUuid = (): string => crypto.randomUUID();

export const now = (): number => Date.now();

/** SQLite stores booleans as 0/1. */
export const bool = (n: unknown): boolean => n === 1;

/** The rowid of a row just inserted under a freshly minted uuid. Reading
    it back by uuid instead of trusting run()'s lastInsertRowid keeps the
    journal off that second round-trip, which is only safe while a driver
    serializes every statement on one connection (ADR-0017). */
export async function rowidByUuid(driver: SqliteDriver, table: string, uuid: string): Promise<number> {
  const rows = await driver.query<{ id: number }>(`SELECT id FROM ${table} WHERE uuid = ?`, [uuid]);
  if (rows.length === 0) throw new Error(`inserted ${table} row not found by uuid`);
  return rows[0].id;
}

/** Fails loudly when a write addressed a row that is not there: a typo'd
    key and a successful write must not look alike to the caller. */
export function assertChanged(result: { changes: number }, what: string): void {
  if (result.changes === 0) throw new Error(`unknown ${what}`);
}
