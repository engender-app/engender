/* Shared plumbing for the journal's area modules. Not exported past the
   journal: everything here is about rows, and rows stay behind the seam. */

import type { SqliteDriver } from '../sqlite/driver';

/* Every row's travelling identity is minted here (ADR-0002).

   crypto.randomUUID arrived in Chrome 92 and the API 26 emulator's WebView
   is Chrome 69, so on an Android that old the call threw and no write of any
   kind could complete - found by ticket 11's contract run on a device.
   getRandomValues is far older than either, so the fallback below is what
   makes the spec's API 26 floor real rather than nominal. */
export const mintUuid = (): string =>
  typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : uuidFromRandomBytes();

/** RFC 4122 version 4, built from 16 random bytes. Exported for its test. */
export function uuidFromRandomBytes(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC 4122 variant
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export const now = (): number => Date.now();

/** SQLite stores booleans as 0/1. */
export const bool = (n: unknown): boolean => n === 1;

/** The rowid of the row matching `where`, named by what it was matched on.
    Reading a rowid back instead of trusting run()'s lastInsertRowid keeps
    the journal off that second round-trip, which is only safe while a driver
    serializes every statement on one connection (ADR-0017). */
export async function rowidWhere(
  driver: SqliteDriver,
  table: string,
  where: string,
  params: unknown[],
  matchedOn: string
): Promise<number> {
  const rows = await driver.query<{ id: number }>(`SELECT id FROM ${table} WHERE ${where}`, params);
  if (rows.length === 0) throw new Error(`${table} row not found by ${matchedOn}`);
  return rows[0].id;
}

/** The rowid of a row just inserted under a freshly minted uuid. */
export const rowidByUuid = (driver: SqliteDriver, table: string, uuid: string): Promise<number> =>
  rowidWhere(driver, table, 'uuid = ?', [uuid], 'uuid');

/** A reference row's travelling identity (ADR-0002): the seeded key for a
    built-in, the minted uuid for a custom. A row with neither can only
    come from writes that bypassed the journal, and failures are loud. */
export function domainIdOf(row: { key: string | null; uuid: string | null }, what: string): string {
  const id = row.key ?? row.uuid;
  if (id == null) throw new Error(`${what} row has neither key nor uuid`);
  return id;
}

/** Fails loudly when a write addressed a row that is not there: a typo'd
    key and a successful write must not look alike to the caller. */
export function assertChanged(result: { changes: number }, what: string): void {
  if (result.changes === 0) throw new Error(`unknown ${what}`);
}
