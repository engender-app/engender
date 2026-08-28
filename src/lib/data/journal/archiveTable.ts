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
    is read into and written out of, straight through.

    Written as a union over the row's own fields rather than one shape with a
    `keyof Row` field, so that the two defaults are typed against the field
    they stand in for - `whenAbsent: 'norwood_hamilton'` on a `number` field
    is a compile error, and so is a typo'd field name. */
export type FlatColumn<Row> =
  | (keyof Row & string)
  | {
      [Field in keyof Row & string]: {
        field: Field;
        /** A 0/1 integer column that travels as a boolean. */
        bool?: true;
        /** What the column is written from when the archive does not carry the
            field at all - a row written by a build from before the field
            existed. Binding `undefined` is not a soft failure: node:sqlite
            refuses it with a raw driver error, so a field added after an area
            shipped needs this. */
        whenAbsent?: Row[Field];
        /** What a NULL in the column is read as, where the wire type is
            narrower than the column - a nullable TEXT that travels as a
            string. */
        whenNull?: Row[Field];
      };
    }[keyof Row & string];

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

/** One column with its declaration read out in full, whichever of the two
    forms it was written in. */
export interface DeclaredColumn {
  column: string;
  field: string;
  bool: boolean;
  whenAbsent: unknown;
  whenNull: unknown;
}

/** Every column of the table, in declaration order. The one way in: both
    directions walk this, so the SELECT, the row-to-field rename, the INSERT
    list and the values it binds are all the same list in the same order. */
export function columnsOf<Row>(table: FlatTable<Row>): DeclaredColumn[] {
  return Object.entries(table.columns).map(([column, declared]) =>
    typeof declared === 'string'
      ? { column, field: declared, bool: false, whenAbsent: undefined, whenNull: undefined }
      : {
          column,
          field: declared.field,
          bool: declared.bool === true,
          whenAbsent: declared.whenAbsent,
          whenNull: declared.whenNull
        }
  );
}

/** The field the table's identity column travels as, which is what an
    already-present row is matched by. Throws rather than guessing: `flat`
    constrains `identity` to a declared column at the declaration site
    (archiveSections.ts), but a descriptor built by hand can still name one
    that is not there, and matching every row against `undefined` would insert
    the whole section again. */
export function identityFieldOf<Row>(table: FlatTable<Row>): string {
  const identity = columnsOf(table).find((column) => column.column === table.identity);
  if (!identity) {
    throw new Error(`flat table ${table.table} is identified by ${table.identity}, which is not one of its columns`);
  }
  return identity.field;
}
