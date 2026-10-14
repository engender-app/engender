import sqlite3InitModule from '@evolu/sqlite-wasm';

// Exercise the actual registered I/O method, including this owner's live locks.
try {
  const sqlite3 = await sqlite3InitModule();
  const { capi, wasm } = sqlite3;
  const pool = await sqlite3.installOpfsSAHPoolVfs({ initialCapacity: 8, directory: 'hot-journal-locks' });
  const db = new sqlite3.oo1.DB({ filename: '/locks.sqlite3', flags: 'c', vfs: 'opfs-sahpool' });
  db.exec('CREATE TABLE marker(value TEXT); INSERT INTO marker VALUES (\'before\')');
  const locks = wasm.scopedAllocCall(() => {
    const out = wasm.scopedAlloc(4);
    if (capi.sqlite3_file_control(db, 'main', capi.SQLITE_FCNTL_FILE_POINTER, out)) throw new Error('file pointer unavailable');
    const file = new capi.sqlite3_file(wasm.peek32(out));
    const methods = new capi.sqlite3_io_methods(file.$pMethods);
    const check = wasm.functionEntry((methods as unknown as { $xCheckReservedLock: number }).$xCheckReservedLock)!;
    const reserved = () => {
      if (check(file.pointer, out)) throw new Error('reserved-lock check failed');
      return wasm.peek32(out);
    };
    try {
      const results = [reserved()];
      db.exec('BEGIN; SELECT * FROM marker');
      results.push(reserved());
      db.exec('ROLLBACK; BEGIN IMMEDIATE');
      results.push(reserved());
      db.exec('PRAGMA cache_size=2; WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x+1 FROM n WHERE x<256) INSERT INTO marker SELECT hex(randomblob(1024)) FROM n');
      results.push(reserved());
      db.exec('ROLLBACK');
      results.push(reserved());
      return results;
    } finally { methods.dispose(); file.dispose(); }
  });
  db.close();
  pool.pauseVfs();
  postMessage({ locks });
} catch (error) { postMessage({ error: String(error) }); }
