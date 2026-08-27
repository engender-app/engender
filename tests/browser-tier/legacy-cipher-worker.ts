/* Ticket 04 compatibility check, not a production path: writes a database
   the way mc-worker.ts did before F-08 pinned the cipher - `PRAGMA hexkey`
   with no `PRAGMA cipher` first, so sqlite3mc picks whatever its compiled
   default is. Exists to prove the pin doesn't strand a journal that was
   already on disk: open the file this writes through the real, pinned
   `createEncryptedWebSqlite` and see whether it still reads.

   A worker for the same reason mc-worker.ts is one - SAHPool's sync access
   handles only exist inside a worker - and its own worker rather than
   sharing mc-worker.ts's, because the two must not hold the pool at once. */

import sqlite3InitModule, { type Sqlite3Static, type SAHPoolUtil } from '@evolu/sqlite-wasm';
import { MC_VFS, poolDirectory } from '../../src/lib/data/sqlite/mc-worker.ts';

let sqlite3: Sqlite3Static | null = null;
let poolUtil: SAHPoolUtil | null = null;

const poolPath = (path: string): string => (path.startsWith('/') ? path : `/${path}`);

const handlers: Record<string, (args: never) => unknown | Promise<unknown>> = {
  async writeWithImplicitCipher(args: { path: string; hexKey: string; statements: string[] }) {
    sqlite3 = await sqlite3InitModule();
    poolUtil = await sqlite3.installOpfsSAHPoolVfs({ initialCapacity: 8, directory: poolDirectory(args.path) });
    const namePtr = sqlite3.wasm.allocCString('opfs-sahpool', false);
    const rc = sqlite3.wasm.exports.sqlite3mc_vfs_create(namePtr, 0) as number;
    if (rc !== 0) throw new Error(`sqlite3mc_vfs_create failed: rc=${rc}`);

    const db = new sqlite3.oo1.DB({ filename: poolPath(args.path), flags: 'c', vfs: MC_VFS });
    try {
      db.exec(`PRAGMA hexkey='${args.hexKey}'`);
      for (const statement of args.statements) db.exec(statement);
    } finally {
      db.close();
    }
  },

  // Releases the pool so the production worker can acquire the same
  // directory next, the way mc-worker.ts's own close() does.
  close() {
    poolUtil?.pauseVfs();
    poolUtil = null;
  }
};

interface Request {
  id: number;
  op: keyof typeof handlers;
  args: never;
}

onmessage = (event: MessageEvent<Request>) => {
  const { id, op, args } = event.data;
  Promise.resolve(handlers[op](args)).then(
    (result) => postMessage({ id, ok: true, result }),
    (error: Error) => postMessage({ id, ok: false, error: String(error?.message ?? error) })
  );
};
