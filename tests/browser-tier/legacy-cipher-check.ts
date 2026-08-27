/* Ticket 04's F-08 compatibility proof: writes a database the way
   mc-worker.ts did before the cipher was pinned (legacy-cipher-worker.ts,
   PRAGMA hexkey with no PRAGMA cipher), then opens that same file through
   the real, pinned `createEncryptedWebSqlite` and reads back what it wrote.
   If the pin ever disagrees with sqlite3mc's compiled default, this is
   where it turns into a refused open instead of an orphaned journal. */

import { createEncryptedWebSqlite } from '../../src/lib/data/sqlite/mc-driver.ts';

const PATH = 'ticket-04-legacy-cipher-compat.sqlite3';
const SENTINEL = 'sentinel-cipher-compat-8420';

const toHex = (bytes: Uint8Array): string => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

function post<T>(worker: Worker, op: string, args: Record<string, unknown> = {}): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    worker.onmessage = (event: MessageEvent<{ ok: boolean; result?: T; error?: string }>) => {
      if (event.data.ok) resolve(event.data.result as T);
      else reject(new Error(event.data.error));
    };
    worker.postMessage({ id: 0, op, args });
  });
}

export async function checkCipherCompat(): Promise<{ cipher: unknown; readBack: unknown }> {
  const key = crypto.getRandomValues(new Uint8Array(32));

  const legacy = new Worker(new URL('./legacy-cipher-worker.ts', import.meta.url), { type: 'module' });
  await post(legacy, 'writeWithImplicitCipher', {
    path: PATH,
    hexKey: toHex(key),
    statements: ["CREATE TABLE t (v TEXT NOT NULL)", `INSERT INTO t (v) VALUES ('${SENTINEL}')`]
  });
  await post(legacy, 'close');
  legacy.terminate();

  const { driver } = createEncryptedWebSqlite(PATH, key);
  const rows = await driver.query<{ v: string }>('SELECT v FROM t');
  const [cipherRow] = await driver.query<Record<string, unknown>>('PRAGMA cipher');
  await driver.close();

  return { cipher: Object.values(cipherRow ?? {})[0], readBack: rows[0]?.v };
}
