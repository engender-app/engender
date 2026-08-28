/* What a flat data area declares about its table, once (ADR-0027, phase 5
   ticket 13).

   Before this, the column list of an area like `size_record` was written out
   four times: the SELECT in archiveRead.ts, the row-to-field map right
   below it, the INSERT list in archiveApply.ts and the value list right
   below that - plus a DELETE in restore.ts naming the table a fifth time.
   Nothing checked the five against each other, and half of the 17 edit
   sites a new flat area cost were the same names retyped.

   One descriptor now feeds all of it: readFlatTable() reads the rows out,
   applyFlatTable() writes them back, and the registry derives the section's
   discard statement from `table`.

   A descriptor is not a policy language, and it is deliberately no wider
   than the areas that fit it. What it cannot say - a child table, a rowid
   resolved against another section, an UPDATE branch for a built-in row a
   Replace overwrites in place - stays a hand-written pair of functions, with
   its reasoning where the behaviour is. */

/** How one column travels. The bare string is the common case: the field it
    is read into and written out of, straight through. */
export type FlatColumn<Row> =
  | (keyof Row & string)
  | {
      field: keyof Row & string;
      /** A 0/1 integer column that travels as a boolean. */
      bool?: true;
      /** What the column is written from when the archive does not carry the
          field at all - a row written by a build from before the field
          existed. Binding `undefined` is not a soft failure: node:sqlite
          refuses it with a raw driver error, so a field added after an area
          shipped needs this. */
      whenAbsent?: unknown;
      /** What a NULL in the column is read as, where the wire type is
          narrower than the column - a nullable TEXT that travels as a
          string. */
      whenNull?: unknown;
    };

/** One flat area's table: read one query out of it, write rows back into it,
    and empty it, all from here. */
export interface FlatTable<Row> {
  table: string;
  /** Column to field, in the order the columns are read and inserted. */
  columns: Readonly<Record<string, FlatColumn<Row>>>;
  /** Named among `columns`: the column an already-present row is matched by,
      which is `uuid` for a row the user made and the natural key for a table
      that holds one row per thing (`personal_effect.effect`,
      `medication_stock.drug`). */
  identity: string;
  /** The read's `ORDER BY`, so an export is stable and a round trip compares
      row by row. */
  orderBy: string;
}

/** The declaration in its long form, whichever form it was written in. */
export function fieldOf<Row>(
  declared: FlatColumn<Row>
): { field: string; bool: boolean; whenAbsent: unknown; whenNull: unknown } {
  if (typeof declared === 'string') {
    return { field: declared, bool: false, whenAbsent: undefined, whenNull: undefined };
  }
  return {
    field: declared.field,
    bool: declared.bool === true,
    whenAbsent: declared.whenAbsent,
    whenNull: declared.whenNull
  };
}

/** Every column of the table, in declaration order, with its field. */
export const columnsOf = <Row>(table: FlatTable<Row>): { column: string; field: FlatColumn<Row> }[] =>
  Object.entries(table.columns).map(([column, field]) => ({ column, field }));
