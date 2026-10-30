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
     uuid), or a row the deletion only changed has been written since (a
     provider named again on the appointment it was cleared from), the
     transaction rolls back and `undo()` rejects; the deletion stands and the
     newer edit is kept.
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

interface Guard {
  tbl: string;
  rid: number;
  col: string;
  /** The value as an SQL literal, from quote(). */
  val: string;
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

/** The shadow tables FTS5 keeps beside a virtual table, by their exact names,
    so a real table that merely starts with an index's name is still captured. */
const FTS5_SHADOWS = ['data', 'idx', 'content', 'docsize', 'config'];

/** The temporary triggers for every ordinary table, and the statements that
    drop them again. FTS5 virtual tables and their shadow tables are left out:
    a trigger cannot be put on the first, and the second is the index's own
    business (only entries are indexed, and entries are never deleted this
    way). */
function captureScript(columns: Column[]): { create: string; drop: string } {
  const virtual = [...new Set(columns.filter((c) => c.isVirtual).map((c) => c.tbl))];
  const byTable = new Map<string, Column[]>();
  for (const column of columns) {
    if (column.isVirtual || virtual.some((name) => FTS5_SHADOWS.some((suffix) => column.tbl === `${name}_${suffix}`))) continue;
    byTable.set(column.tbl, [...(byTable.get(column.tbl) ?? []), column]);
  }

  const create: string[] = [
    'CREATE TEMP TABLE undo_log (seq INTEGER PRIMARY KEY, kind TEXT NOT NULL, tbl TEXT NOT NULL, rid INTEGER NOT NULL, inverse TEXT NOT NULL)',
    // What each column an update changed was left holding, so an undo can
    // tell whether anything has written it since.
    'CREATE TEMP TABLE undo_guard (seq INTEGER PRIMARY KEY, tbl TEXT NOT NULL, rid INTEGER NOT NULL, col TEXT NOT NULL, val TEXT NOT NULL)'
  ];
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
    const guards = cols
      .map((c) => `INSERT INTO undo_guard (tbl, rid, col, val) SELECT ${t}, NEW.rowid, ${literal(c.col)}, quote(NEW.${ident(c.col)}) WHERE OLD.${ident(c.col)} IS NOT NEW.${ident(c.col)};`)
      .join(' ');
    const d = `undo_d_${n}`;
    const u = `undo_u_${n}`;
    const i = `undo_i_${n}`;
    n++;
    create.push(
      `CREATE TEMP TRIGGER ${d} BEFORE DELETE ON ${target} BEGIN INSERT INTO undo_log (kind, tbl, rid, inverse) VALUES ('d', ${t}, OLD.rowid, ${reinsert}); END`,
      `CREATE TEMP TRIGGER ${u} BEFORE UPDATE ON ${target} BEGIN INSERT INTO undo_log (kind, tbl, rid, inverse) SELECT 'u', ${t}, OLD.rowid, ${restore} FROM (SELECT ${changed} AS s) WHERE s <> ''; ${guards} END`,
      `CREATE TEMP TRIGGER ${i} AFTER INSERT ON ${target} BEGIN INSERT INTO undo_log (kind, tbl, rid, inverse) VALUES ('i', ${t}, NEW.rowid, ${unInsert}); END`
    );
    drop.push(`DROP TRIGGER temp.${d}`, `DROP TRIGGER temp.${u}`, `DROP TRIGGER temp.${i}`);
  }
  drop.push('DROP TABLE temp.undo_log', 'DROP TABLE temp.undo_guard');
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

  const { entries: log, guards } = await driver.transaction(async (scope) => {
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
    const rows = await scope.query<{ kind: string; tbl: string; rid: number; inverse: string }>(
      'SELECT kind, tbl, rid, inverse FROM temp.undo_log ORDER BY seq'
    );
    const guardRows = await scope.query<{ tbl: string; rid: number; col: string; val: string }>(
      'SELECT tbl, rid, col, val FROM temp.undo_guard ORDER BY seq'
    );
    await scope.exec(script.drop);
    /* The last value each surviving row's column was left with. A row the
       deletion went on to delete has nothing to guard: its re-insert fails
       on its own if something took its place. */
    const gone = new Set(rows.filter((row) => row.kind === 'd').map((row) => `${row.tbl}\t${row.rid}`));
    const last = new Map<string, Guard>();
    for (const g of guardRows) if (!gone.has(`${g.tbl}\t${g.rid}`)) last.set(`${g.tbl}\t${g.rid}\t${g.col}`, g);
    return { entries: rows.map((row) => ({ tbl: row.tbl, inverse: row.inverse })), guards: [...last.values()] };
  });
  if (heldFiles.length > 0) markOrphanSweepDue();

  let state: 'open' | 'undone' | 'finished' = 'open';
  return {
    tables: [...new Set(log.map((row) => row.tbl))],
    async undo() {
      if (state !== 'open' || log.length === 0) return;
      await driver.transaction(async (scope) => {
        for (const g of guards) {
          const [still] = await scope.query(`SELECT 1 FROM main.${ident(g.tbl)} WHERE rowid = ${Number(g.rid)} AND ${ident(g.col)} IS ${g.val}`);
          if (!still) throw new Error(`${g.tbl}.${g.col} has changed since the deletion, so it is not put back`);
        }
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
