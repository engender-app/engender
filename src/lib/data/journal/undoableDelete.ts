/* Undo for every deletion other than an entry's (functional audit ticket 46).

   An entry is soft-deleted: it carries `trashed_at` and waits in Trash. Nothing
   else does, and the audit ruled out adding soft-delete columns to the other
   areas. So a deletion here is the ordinary hard delete, run in a way that can
   be taken back for a short window:

   - The whole delete runs as one transaction. Before it starts, a temporary
     trigger is put on every table for DELETE, UPDATE and INSERT. Each one
     writes the statement that reverses its row's change into a temporary log:
     the row as it was for a delete (every column, its rowid included), the old
     values of the columns that changed for an update, and a delete by rowid
     for an insert. Foreign-key cascades and SET NULLs fire the same triggers,
     so a row the delete only reached through the schema is in the log as
     well. The log is read, then the triggers and the log are dropped, before
     the transaction commits. Nothing temporary outlives the delete.
   - File removals the delete asks for are held back, not done. The orphan
     sweep is marked due at once, so a window that never closes (the app is
     killed) still loses the files at a later boot.
   - `undo()` runs the log backwards in one transaction with foreign keys
     deferred to its commit, which puts back the same rows with the same ids,
     uuids and `updated_at` stamps. To anything that reads the database
     afterwards, Merge included (ticket 48), an undone deletion never
     happened. If a row cannot go back (something new took its rowid or its
     uuid), the transaction rolls back and `undo()` rejects; the deletion
     stands.
   - `finish()` closes the window: the held files are removed. Calling `undo()`
     after it, or `finish()` after an undo, does nothing.

   The log lives in this module's memory between the delete and the end of the
   window, and the caller drops it (by calling `finish()`) when the window
   closes, the app locks included. */

import type { SqliteDriver } from '../sqlite/driver';
import type { PhotoFileStore } from '../photos/photo-file-store';
import { markOrphanSweepDue } from '../sqlite/orphan-sweep-schedule';

export interface UndoableDelete {
  /** Every SQL table the deletion changed, in the order it first changed them. */
  readonly tables: readonly string[];
  /** Puts back every row the deletion removed or changed. */
  undo(): Promise<void>;
  /** Ends the window and removes the files the deletion let go of. */
  finish(): Promise<void>;
}

interface Column {
  tbl: string;
  col: string;
  pk: number;
  type: string;
  isVirtual: number;
}

const ident = (name: string) => `"${name.replaceAll('"', '""')}"`;
const literal = (text: string) => `'${text.replaceAll("'", "''")}'`;

/** The temporary triggers for every ordinary table, and the statements that
    drop them again. FTS5 virtual tables and their shadow tables are left out:
    a trigger cannot be put on the first, and the second is the index's own
    business (only entries are indexed, and entries are never deleted this
    way). */
function captureScript(columns: Column[]): { create: string; drop: string } {
  const virtual = [...new Set(columns.filter((c) => c.isVirtual).map((c) => c.tbl))];
  const byTable = new Map<string, Column[]>();
  for (const column of columns) {
    if (column.isVirtual || virtual.some((name) => column.tbl.startsWith(`${name}_`))) continue;
    byTable.set(column.tbl, [...(byTable.get(column.tbl) ?? []), column]);
  }

  const create: string[] = ['CREATE TEMP TABLE undo_log (seq INTEGER PRIMARY KEY, tbl TEXT NOT NULL, inverse TEXT NOT NULL)'];
  const drop: string[] = [];
  let n = 0;
  for (const [table, cols] of byTable) {
    const target = `main.${ident(table)}`;
    const keys = cols.filter((c) => c.pk > 0);
    // An INTEGER PRIMARY KEY is the rowid itself, and naming both in one
    // INSERT is an error; any other table names its rowid explicitly, so an
    // update's inverse finds the same row after the delete's inverse.
    const rowidIsColumn = keys.length === 1 && keys[0].type === 'INTEGER';
    const names = [...(rowidIsColumn ? [] : ['rowid']), ...cols.map((c) => ident(c.col))];
    const values = [...(rowidIsColumn ? [] : ['OLD.rowid']), ...cols.map((c) => `OLD.${ident(c.col)}`)]
      .map((value) => `quote(${value})`)
      .join(` || ',' || `);
    const reinsert = `${literal(`INSERT INTO ${target} (${names.join(', ')}) VALUES (`)} || ${values} || ')'`;
    const changed = cols
      .map((c) => `(CASE WHEN OLD.${ident(c.col)} IS NOT NEW.${ident(c.col)} THEN ${literal(`, ${ident(c.col)} = `)} || quote(OLD.${ident(c.col)}) ELSE '' END)`)
      .join(' || ');
    const restore = `${literal(`UPDATE ${target} SET `)} || substr(s, 3) || ' WHERE rowid = ' || OLD.rowid`;
    const unInsert = `${literal(`DELETE FROM ${target} WHERE rowid = `)} || NEW.rowid`;
    const t = literal(table);
    const d = `undo_d_${n}`;
    const u = `undo_u_${n}`;
    const i = `undo_i_${n}`;
    n++;
    create.push(
      `CREATE TEMP TRIGGER ${d} BEFORE DELETE ON ${target} BEGIN INSERT INTO undo_log (tbl, inverse) VALUES (${t}, ${reinsert}); END`,
      `CREATE TEMP TRIGGER ${u} BEFORE UPDATE ON ${target} BEGIN INSERT INTO undo_log (tbl, inverse) SELECT ${t}, ${restore} FROM (SELECT ${changed} AS s) WHERE s <> ''; END`,
      `CREATE TEMP TRIGGER ${i} AFTER INSERT ON ${target} BEGIN INSERT INTO undo_log (tbl, inverse) VALUES (${t}, ${unInsert}); END`
    );
    drop.push(`DROP TRIGGER temp.${d}`, `DROP TRIGGER temp.${u}`, `DROP TRIGGER temp.${i}`);
  }
  drop.push('DROP TABLE temp.undo_log');
  return { create: `${create.join(';\n')};`, drop: `${drop.join(';\n')};` };
}

/** One transaction scope, offered to the areas as a whole driver: their own
    transactions and read snapshots run inline in it, since nothing else can
    enter the connection while it is held. */
function inline(scope: SqliteDriver): SqliteDriver {
  const driver: SqliteDriver = {
    exec: (sql) => scope.exec(sql),
    query: (sql, params) => scope.query(sql, params),
    run: (sql, params) => scope.run(sql, params),
    getUserVersion: () => scope.getUserVersion(),
    setUserVersion: (version) => scope.setUserVersion(version),
    deferUntilCommit: (cleanup) => scope.deferUntilCommit?.(cleanup),
    transaction: async (work) => work(driver),
    readSnapshot: (read) => read(driver),
    close: async () => {
      throw new Error('an undoable delete cannot close the connection');
    }
  };
  return driver;
}

/** Runs `remove` against a journal opened over one capturing transaction, and
    hands back what it takes to reverse it. */
export async function captureDelete<J>(
  driver: SqliteDriver,
  files: PhotoFileStore,
  open: (driver: SqliteDriver, files: PhotoFileStore) => J,
  remove: (journal: J) => Promise<unknown>
): Promise<UndoableDelete> {
  const heldFiles: string[] = [];
  const holding: PhotoFileStore = {
    write: (name, bytes) => files.write(name, bytes),
    read: (name) => files.read(name),
    size: (name) => files.size(name),
    list: () => files.list(),
    ...(files.readMany ? { readMany: (names: string[]) => files.readMany!(names) } : {}),
    ...(files.sizeMany ? { sizeMany: (names: string[]) => files.sizeMany!(names) } : {}),
    remove: async (name) => {
      heldFiles.push(name);
    }
  };

  const log = await driver.transaction(async (scope) => {
    const columns = await scope.query<Column & Record<string, unknown>>(
      `SELECT m.name AS tbl, p.name AS col, p.pk AS pk, upper(p.type) AS type,
              m.sql LIKE 'CREATE VIRTUAL TABLE%' AS isVirtual
         FROM sqlite_master m JOIN pragma_table_info(m.name) p
        WHERE m.type = 'table' AND m.name NOT LIKE 'sqlite_%'
        ORDER BY m.name, p.cid`
    );
    const script = captureScript(columns);
    await scope.exec(script.create);
    await remove(open(inline(scope), holding));
    const rows = await scope.query<{ tbl: string; inverse: string }>('SELECT tbl, inverse FROM temp.undo_log ORDER BY seq');
    await scope.exec(script.drop);
    return rows.map((row) => ({ tbl: row.tbl, inverse: row.inverse }));
  });
  if (heldFiles.length > 0) markOrphanSweepDue();

  let state: 'open' | 'undone' | 'finished' = 'open';
  return {
    tables: [...new Set(log.map((row) => row.tbl))],
    async undo() {
      if (state !== 'open' || log.length === 0) return;
      await driver.transaction(async (scope) => {
        await scope.exec('PRAGMA defer_foreign_keys = ON');
        await scope.exec(`${log.map((row) => row.inverse).reverse().join(';\n')};`);
      });
      state = 'undone';
      log.length = 0;
    },
    async finish() {
      if (state !== 'open') return;
      state = 'finished';
      log.length = 0;
      for (const name of heldFiles) {
        try {
          await files.remove(name);
        } catch (error) {
          // Already marked due above: the sweep takes what this could not.
          console.warn('Could not remove a deleted file', error);
        }
      }
    }
  };
}
