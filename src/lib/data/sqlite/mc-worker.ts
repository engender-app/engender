/* The worker half of the encrypted web driver (ticket 09, ADR-0020):
   SQLite3MultipleCiphers WASM over the synchronous OPFS SAHPool VFS,
   wrapped in sqlite3mc's encryption shim. The exact open/key/VFS sequence
   is the one the ticket 08 prototype proved out (prototype/encryption/web/
   whole-db-worker.ts on the prototype/encryption-mechanism branch):
   sqlite3mc refuses to encrypt on the async 'opfs' VFS and on a bare
   'opfs-sahpool' - the pool VFS must be wrapped via sqlite3mc_vfs_create()
   and the database opened through the wrapped name.

   A worker because SAHPool's synchronous access handles only exist in one,
   and this file is the only place the wasm module, the pool or a database
   pointer appear - mc-driver.ts talks to it in messages, everything above
   talks to SqliteDriver (ADR-0017).

   Messages are handled strictly in arrival order through one promise
   chain. The handlers after `open` are all synchronous, so this mostly
   guards one case: a statement arriving while the wasm module is still
   initializing must wait for it, not race it.

   The pre-migration copy is VACUUM INTO a URI carrying the same hexkey,
   so the copy is written through a pager keyed like the original's and is
   ciphertext on disk (ADR-0006 + ADR-0018: coverage includes migration
   copies). The wasm build has no sqlite3_backup_*, and the pool util's
   importDb() insists on the plaintext SQLite magic an encrypted file does
   not carry - VACUUM INTO is the copy mechanism that exists here. SAHPool
   stores opaque pool files, so the cleanup goes through the pool util
   rather than OPFS paths.

   The pool's OPFS directory is namespaced per database name (ticket 11):
   SAHPool's directory is shared origin-wide by default, and only one
   worker can hold it at a time - a second encrypted connection open in
   the same origin fails its first sync access handle with "Access
   Handles cannot be created if there is another open Access Handle", a
   failure that then surfaces as a confusing null-database error on
   whatever statement runs next rather than as itself. Production only
   ever opens one connection against the fixed Journal filename, so
   keying the directory off the database name keeps that persistent
   (ADR-0020's web driver survives reloads) while giving anything that
   opens more than one connection at once - namely this codebase's own
   cross-platform archive probe - separate storage instead of a collision. */

import sqlite3InitModule, { type Database, type Sqlite3Static, type SAHPoolUtil } from '@evolu/sqlite-wasm';

const MC_VFS = 'multipleciphers-opfs-sahpool';

let sqlite3: Sqlite3Static | null = null;
let poolUtil: SAHPoolUtil | null = null;
let db: Database | null = null;
let databasePath = '';
let backupPath = '';
let hexKey = '';
// Set when `open`/`convert` fails after the pool attaches, so a later
// queued statement reports the real cause instead of racing a null `db`.
let openError: Error | null = null;

// A pool directory name derived from the database's own path: stable
// across reloads for a given database and distinct across databases, but
// hashed rather than embedding the path itself - this driver exists to
// keep the journal's contents unreadable at rest (ADR-0018), and a
// directory literally named after "gender-diary.sqlite3" would defeat the
// same closed-app OPFS scan that proves nothing plaintext survives there.
function poolDirectory(path: string): string {
  let hash = 2166136261; // FNV-1a, just for a short stable non-identifying tag.
  for (let i = 0; i < path.length; i++) {
    hash ^= path.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `mc-pool-${(hash >>> 0).toString(36)}`;
}

/** Applies the raw data key (ADR-0018: PRAGMA hexkey, not a passphrase
    through sqlite3mc's own KDF - stretching already happened in the
    keystore) and proves it by reading, so a wrong key fails here as
    SQLITE_NOTADB rather than on some later query. */
function keyAndVerify(target: Database, key: string): void {
  target.exec(`PRAGMA hexkey='${key}'`);
  target.exec('SELECT count(*) FROM sqlite_master');
}

/** Brings up the wasm module, the pool and the encryption shim, without
    opening anything. Split out of `open` because a conversion has to have
    the VFS before there is a database to open through it (ticket 10), and
    because `sqlite3mc_vfs_create` may only wrap the pool once. */
async function attach(seedPath: string): Promise<Sqlite3Static> {
  if (sqlite3 && poolUtil) return sqlite3;
  sqlite3 = await sqlite3InitModule();
  /* Slots, not files: the pool holds main database + rollback journal +
     the pre-migration copy + its journal, and does not grow on demand.
     Eight leaves headroom over that worst case. */
  poolUtil = await sqlite3.installOpfsSAHPoolVfs({
    initialCapacity: 8,
    directory: poolDirectory(seedPath)
  });
  const namePtr = sqlite3.wasm.allocCString('opfs-sahpool', false);
  const rc = sqlite3.wasm.exports.sqlite3mc_vfs_create(namePtr, 0) as number;
  if (rc !== 0) throw new Error(`sqlite3mc_vfs_create failed: rc=${rc}`);
  return sqlite3;
}

// SAHPool stores every name with a leading slash; matching it keeps
// unlink() finding the same file VACUUM INTO writes.
const poolPath = (path: string): string => (path.startsWith('/') ? path : `/${path}`);

const handlers: Record<string, (args: never) => unknown | Promise<unknown>> = {
  async open(args: { path: string; hexKey: string }) {
    const api = await attach(args.path);
    databasePath = poolPath(args.path);
    backupPath = `${databasePath}.pre-migration-backup`;
    hexKey = args.hexKey;
    db = new api.oo1.DB({ filename: databasePath, flags: 'c', vfs: MC_VFS });
    keyAndVerify(db, hexKey);
  },

  /* Ticket 10: a plaintext-era database becomes the encrypted Journal.

     Not VACUUM INTO, which is how the pre-migration copy below is made.
     sqlite3mc decides a destination's cipher from the source connection's,
     not from the destination URI: with an unencrypted source, VACUUM INTO
     writes an unencrypted file and ignores the `hexkey` in the URI
     entirely. Measured, not assumed - the copy came out carrying "SQLite
     format 3" and the seeded text in the clear. The pre-migration copy is
     unaffected because there the source is already keyed.

     Rekeying the source in memory first is the obvious next idea and
     sqlite3mc refuses it outright: "Rekeying not supported for in-memory
     or temporary databases". So the plaintext goes into the pool under the
     name the Journal will keep, and PRAGMA hexrekey rewrites every page of
     it in place.

     The cost is honest and has to be named: between importDb and the end
     of the rekey there is a readable copy of the Journal in the pool, and
     the rollback journal that makes the rekey atomic holds plaintext pages
     while it runs. Both are inside the window where the app has not
     claimed to be encrypted yet - the source it was copied from is sitting
     in the OPFS root, readable, the whole time - and both are gone before
     the conversion reports success. The claim gate reads the pool's bytes
     afterwards rather than taking that on trust
     (tests/browser-tier/conversion-probe.ts).

     Both names are unlinked first: importDb will not write over a slot
     that is in use, and a target left half-written by a killed attempt is
     thrown away rather than reasoned about, which is what lets the caller
     resume by simply calling this again. */
  async convert(args: { path: string; hexKey: string; bytes: Uint8Array }) {
    const api = await attach(args.path);
    const target = poolPath(args.path);
    await poolUtil!.unlink(target);
    await poolUtil!.unlink(`${target}-journal`);

    await poolUtil!.importDb(target, args.bytes);
    const imported = new api.oo1.DB({ filename: target, flags: 'c', vfs: MC_VFS });
    try {
      imported.exec(`PRAGMA hexrekey='${args.hexKey}'`);
    } finally {
      imported.close();
    }
  },

  exec(args: { sql: string }) {
    db!.exec(args.sql);
  },

  query(args: { sql: string; params: unknown[] }) {
    return db!.exec({
      sql: args.sql,
      bind: args.params.length > 0 ? (args.params as never) : undefined,
      rowMode: 'object',
      returnValue: 'resultRows'
    });
  },

  run(args: { sql: string; params: unknown[] }) {
    db!.exec({ sql: args.sql, bind: args.params.length > 0 ? (args.params as never) : undefined });
    return {
      changes: db!.changes(),
      lastInsertRowid: Number(sqlite3!.capi.sqlite3_last_insert_rowid(db!))
    };
  },

  /* Whether a copy from an earlier boot is in the pool and can be read back
     as a journal. Not a file listing: SAHPool names are its own, and
     getFileNames() is the only thing that knows them - and a name in that list
     says nothing about whether the file behind it opens under the data key.

     So it is opened and counted. A copy nobody can read is not a recovery
     point, and the two callers both need the stronger answer: the runner
     refuses an empty journal only when there is a real one to put back, and
     the failure screen must not offer a restore it cannot perform. */
  async preMigrationCopyIsUsable() {
    if (!poolUtil!.getFileNames().includes(backupPath)) return false;
    const api = await attach(databasePath);
    const copy = new api.oo1.DB({ filename: backupPath, flags: 'c', vfs: MC_VFS });
    try {
      keyAndVerify(copy, hexKey);
      const [tables] = copy.exec({
        sql: "SELECT count(*) AS tables FROM sqlite_master WHERE type = 'table'",
        rowMode: 'object',
        returnValue: 'resultRows'
      }) as { tables: number }[];
      return tables.tables > 0;
    } catch {
      // Unreadable under this key, or not a database: no recovery point.
      return false;
    } finally {
      copy.close();
    }
  },

  async copyDatabaseFile() {
    /* Through both pagers - the source's decrypts, the destination's (keyed
       by the URI's hexkey) encrypts - never through file bytes, which the
       pool keeps opaque anyway. Any copy left by an interrupted migration
       goes first: VACUUM INTO refuses an existing target. The runner only
       calls this when there is none to lose (ticket 04), so what the unlink
       clears is a target left half-written inside this same call. */
    await poolUtil!.unlink(backupPath);
    db!.exec(`VACUUM INTO 'file:${backupPath}?vfs=${MC_VFS}&hexkey=${hexKey}'`);
  },

  /* Ticket 04: the copy becomes the live Journal again, after a migration
     that could not be finished.

     VACUUM INTO in the other direction, from the copy as source, for the
     reason the copy itself is written that way: the pool's bytes are opaque,
     there is no sqlite3_backup_* in this wasm build, and importDb wants the
     plaintext magic that an encrypted file does not carry. Both connections
     are keyed with the same hexkey, so the restored database is ciphertext on
     disk like everything else the pool holds.

     The live database is closed first, and the target unlinked, because
     VACUUM INTO refuses an existing target and the file being replaced is the
     one this worker has open. The copy stays where it is afterwards: it is
     still the only insurance, and ADR-0006 retires it at the next clean boot,
     which is a boot that found nothing pending - not this one. */
  async restorePreMigrationCopy() {
    if (!poolUtil!.getFileNames().includes(backupPath)) {
      throw new Error('there is no pre-migration copy to restore');
    }
    db?.close();
    db = null;

    const api = await attach(databasePath);
    const copy = new api.oo1.DB({ filename: backupPath, flags: 'c', vfs: MC_VFS });
    try {
      /* Before anything is unlinked: keyAndVerify reads sqlite_master, so a
         copy that cannot be opened under this key fails here, with the
         database it was going to replace still on disk. */
      keyAndVerify(copy, hexKey);
      await poolUtil!.unlink(databasePath);
      await poolUtil!.unlink(`${databasePath}-journal`);
      copy.exec(`VACUUM INTO 'file:${databasePath}?vfs=${MC_VFS}&hexkey=${hexKey}'`);
    } finally {
      copy.close();
    }
  },

  async cleanupPreMigrationCopy() {
    await poolUtil!.unlink(backupPath);
  },

  close() {
    db?.close();
    db = null;
    /* pauseVfs() lets go of the pool's sync access handles - which is what
       allows a reset to empty the OPFS directory, and a later worker to
       acquire the pool again. Not removeVfs(): that deletes the pool's
       directory, databases included. */
    poolUtil?.pauseVfs();
    poolUtil = null;
    openError = null;
  }
};

interface Request {
  id: number;
  op: keyof typeof handlers;
  args: never;
}

let chain: Promise<void> = Promise.resolve();

onmessage = (event: MessageEvent<Request>) => {
  const { id, op, args } = event.data;
  chain = chain.then(async () => {
    try {
      // `open`/`convert` having already failed leaves `db` null; running a
      // later handler against it would fail with an unrelated null-reference
      // error instead of the real cause. Report that cause again instead -
      // except for `close`, which still has to run to release the pool.
      if (openError && op !== 'open' && op !== 'convert' && op !== 'close') throw openError;
      const result = await handlers[op](args);
      postMessage({ id, ok: true, result });
    } catch (error) {
      if (op === 'open' || op === 'convert') openError = error as Error;
      /* The message crosses the worker boundary as a string; the key never
         appears in one - SQLite reports codes ("file is not a database"),
         not the PRAGMA text. */
      postMessage({ id, ok: false, error: String((error as Error)?.message ?? error) });
    }
  });
};
