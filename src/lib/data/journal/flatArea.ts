/* The three writes a flat area has, derived once from the one thing that
   differs between them: which column each field is stored in.

   A **flat area** is one whose row is its domain object - a travelling
   uuid, a handful of scalar columns, `updated_at`, no join, no projection
   and no cascade. Six of the journal's areas are that shape, and
   each had written the same three statements by hand: a SELECT naming its
   columns, an UPDATE-or-INSERT naming them twice more, and a DELETE. Forty-
   eight id-addressed writes copied that way is how the delete contract came
   to split in two (ADR-0053), which is what this exists to stop: the six
   share `upsert` and `delete`, so the contract holds by construction rather
   than by everyone remembering it.

   WHAT IS NOT HERE. The reads. `read` takes whatever follows the FROM and
   nothing else - each area still writes its own WHERE and ORDER BY, because
   the read set is not a bounded enum: measurements groups by unit in JS for
   a correctness reason (cm and inches must not become one chart line), size
   records need by-category, tally by-kind, journaling pauses all-only.
   Describing that declaratively is where a factory grows options, and
   ADR-0027 already refused a descriptor that is really a policy language.

   A pre-write guard is a hook rather than an option for the same reason:
   `guard` is a pure function of the input, so an area validating a closed
   vocabulary passes its own validator and nothing here learns what a
   severity or a garment category is.

   NOT THE ARCHIVE'S DESCRIPTOR. `archiveTable.ts`'s `FlatTable` maps the
   same six tables column-by-column and looks like the same declaration
   written twice. It is not: that one says what **travels**, this one says
   what is **stored**, and the two legitimately differ - `tally_event.context`
   is a stored column no archive carries, `regimen_episode.hidden` the same
   shape again, and an archive descriptor also carries the wire concerns
   (`bool`, `whenAbsent`, `whenNull`) that a local write has no opinion
   about. Folding them into one declaration would need an option per
   divergence, which is the descriptor-as-policy-language ADR-0027 refused.
   They agree today, and nothing here depends on them agreeing.

   `eras` is the seventh flat area and stays out. Its pre-write check is
   `assertEraFits(await getEras(), input)` - a whole-table invariant that
   returns four discriminated conflict cases so the editor can name the era
   you are overlapping while you type. That is behaviour, not validation,
   and reaching it from here needs the option this file refuses. It owes the
   contract by comment and test instead. */

import type { SqliteDriver } from '../sqlite/driver';
import { assertChanged, mintUuid, now } from './support';

/** A flat area's row: its travelling identity, plus one column per field. */
export type FlatRow = Record<string, unknown> & { uuid: string };

/** What a flat area's upsert takes: the domain object with its id optional,
    absent to insert and present to update. Declared here so an area's own
    input type cannot drift from the row it writes. */
export type FlatInput<Domain extends { id: string }> = Omit<Domain, 'id'> & { id?: string };

export interface FlatAreaSpec<Domain extends { id: string }> {
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
