/* Build the common write paths for a flat journal row (ADR-0053).
   Map scalar fields to columns beside a traveling UUID and updated_at.
   Each area supplies its WHERE and ORDER BY to read and may pass a
   pure input guard. Joins and cascades belong in the owning area.

   The Archive descriptor separately declares fields on the wire and
   their missing-value behavior (ADR-0027). Eras use a custom write
   because overlap validation reads existing rows and returns conflicts
   the editor displays while a person types. */

import type { SqliteDriver } from '../sqlite/driver';
import { assertChanged, mintUuid, now } from './support';

/** A flat area's row: its travelling identity, plus one column per field. */
type FlatRow = Record<string, unknown> & { uuid: string };

/** What a flat area's upsert takes: the domain object with its id optional,
    absent to insert and present to update. Declared here so an area's own
    input type cannot drift from the row it writes. */
export type FlatInput<Domain extends { id: string }> = Omit<Domain, 'id'> & { id?: string };

interface FlatAreaSpec<Domain extends { id: string }> {
  table: string;
  /** Every field but `id`, in the column it is stored in. Exhaustive on
      purpose: a field added to the domain type does not compile until it is
      given a column here. */
  columns: { readonly [Field in keyof Omit<Domain, 'id'>]: string };
  /** Refuses a bad input before anything is written, so a value outside a
      closed vocabulary reads as the area's own message rather than a raw
      SQLite constraint failure. Pure - a function of the input, with no
      driver and no read of its own. */
  guard?: (input: Omit<Domain, 'id'>) => void;
}

/* FlatArea stays exported only for its own test (AU-09 test-only review). */
export interface FlatArea<Domain extends { id: string }> {
  /** This table's rows as domain objects, under `tail` - everything after
      `SELECT <columns> FROM <table>`, which is the area's own business. */
  read(tail: string, params?: unknown[]): Promise<Domain[]>;
  /** Returns the row's id. Updating an unknown id throws (ADR-0053). */
  upsert(input: FlatInput<Domain>): Promise<string>;
  /** Deleting an unknown id succeeds and changes nothing (ADR-0053). */
  delete(id: string): Promise<void>;
}

export function flatArea<Domain extends { id: string }>(
  driver: SqliteDriver,
  spec: FlatAreaSpec<Domain>
): FlatArea<Domain> {
  type Field = keyof Omit<Domain, 'id'>;

  const fields = Object.keys(spec.columns) as Field[];
  const columns = fields.map((field) => spec.columns[field]);
  const selectList = ['uuid', ...columns].join(', ');
  /** What `assertChanged` names in its message: `cycle_event` reads back as
      "unknown cycle event", the wording every area already used. */
  const what = spec.table.replace(/_/g, ' ');

  const toDomain = (row: FlatRow): Domain => {
    const domain: Record<string, unknown> = { id: row.uuid };
    for (const field of fields) domain[field as string] = row[spec.columns[field]];
    return domain as Domain;
  };

  return {
    async read(tail, params) {
      const rows = await driver.query<FlatRow>(`SELECT ${selectList} FROM ${spec.table} ${tail}`, params);
      return rows.map(toDomain);
    },

    async upsert(input) {
      spec.guard?.(input);
      const values = fields.map((field) => (input as Record<string, unknown>)[field as string]);

      if (input.id) {
        const result = await driver.run(
          `UPDATE ${spec.table} SET ${columns.map((column) => `${column} = ?`).join(', ')}, updated_at = ?
            WHERE uuid = ?`,
          [...values, now(), input.id]
        );
        assertChanged(result, `${what}: ${input.id}`);
        return input.id;
      }

      const uuid = mintUuid();
      const placeholders = columns.map(() => '?').join(', ');
      await driver.run(
        `INSERT INTO ${spec.table} (uuid, ${columns.join(', ')}, updated_at) VALUES (?, ${placeholders}, ?)`,
        [uuid, ...values, now()]
      );
      return uuid;
    },

    async delete(id) {
      await driver.run(`DELETE FROM ${spec.table} WHERE uuid = ?`, [id]);
    }
  };
}
