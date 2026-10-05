import sqlite3InitModule, { type Database, type SAHPoolUtil } from '@evolu/sqlite-wasm';

type Command = { command: string; role?: string; scenario?: string };
let role = '';
let scenario = '';
let pool: SAHPoolUtil;
let database: Database;
let allowCleanup!: () => void;
let allowAccess!: () => void;
let allowReopen!: () => void;
const cleanupAllowed = new Promise<void>((resolve) => { allowCleanup = resolve; });
const accessAllowed = new Promise<void>((resolve) => { allowAccess = resolve; });
const reopenAllowed = new Promise<void>((resolve) => { allowReopen = resolve; });
const liveHandles = new Set<{ close(): void }>();
let poolAcquisitions = 0;
let acquiredAfterContention = 0;
let contentionSeen = false;

// Keep the real rejection, controlling only when the old owner lets go.
const fileHandle = FileSystemFileHandle.prototype as FileSystemFileHandle & {
  createSyncAccessHandle(): Promise<{ close(): void }>;
};
const originalAccess = fileHandle.createSyncAccessHandle;
fileHandle.createSyncAccessHandle = async function () {
  const poolFile = !this.name.startsWith('.opfs-sahpool-sync-check-');
  if (role === 'contender' && scenario === 'late-acquisition' && poolFile && poolAcquisitions++ > 0) {
    await accessAllowed;
  }
  try {
    const handle = await originalAccess.call(this);
    if (contentionSeen && poolFile) acquiredAfterContention++;
    liveHandles.add(handle);
    const close = handle.close.bind(handle);
    handle.close = () => { close(); liveHandles.delete(handle); };
    return handle;
  } catch (error) {
    contentionSeen = true;
    postMessage({ event: 'contention', error: String(error) });
    throw error;
  }
};
const originalRemove = FileSystemDirectoryHandle.prototype.removeEntry;
FileSystemDirectoryHandle.prototype.removeEntry = async function (name, options) {
  if (role === 'contender' && name === '.opaque' && options?.recursive) {
    postMessage({ event: 'destructive-cleanup' });
    await cleanupAllowed;
  }
  return originalRemove.call(this, name, options);
};

async function open(key = '07'.repeat(32)) {
  const sqlite3 = await sqlite3InitModule();
  pool = await sqlite3.installOpfsSAHPoolVfs({ initialCapacity: 8, directory: `pool-initialization-${scenario}` });
  const name = sqlite3.wasm.allocCString('opfs-sahpool', false);
  if (sqlite3.wasm.exports.sqlite3mc_vfs_create(name, 0) !== 0) throw new Error('cipher VFS creation failed');
  database = new sqlite3.oo1.DB({ filename: '/synthetic.sqlite3', flags: 'c', vfs: 'multipleciphers-opfs-sahpool' });
  database.exec("PRAGMA cipher='chacha20'");
  database.exec(`PRAGMA hexkey='${key}'`);
  database.exec('SELECT count(*) FROM sqlite_master');
}

onmessage = async ({ data }: MessageEvent<Command>) => {
  role = data.role ?? role;
  scenario = data.scenario ?? scenario;
  try {
    if (data.command === 'seed') {
      await open();
      database.exec('CREATE TABLE synthetic_marker(value TEXT NOT NULL)');
      database.exec("INSERT INTO synthetic_marker VALUES ('journal survives contention')");
      database.close();
      postMessage({ event: 'seeded' });
    } else if (data.command === 'release') {
      pool.pauseVfs();
      postMessage({ event: 'released' });
    } else if (data.command === 'owner-released') {
      allowCleanup(); allowAccess(); allowReopen();
    } else if (data.command === 'contend') {
      let failed = false;
      try { await open(); }
      catch (error) {
        failed = true;
        postMessage({ event: 'attach-failed', error: String(error), liveHandles: liveHandles.size, acquiredAfterContention });
      }
      if (!failed) throw new Error('the probe did not exercise a lock collision');
      await reopenAllowed;
      await open();
      const exists = database.selectValue("SELECT count(*) FROM sqlite_master WHERE name='synthetic_marker'") === 1;
      const preserved = exists && database.selectValue('SELECT value FROM synthetic_marker') === 'journal survives contention';
      database.close();
      pool.pauseVfs();
      await open();
      const reopened = database.selectValue("SELECT count(*) FROM sqlite_master WHERE name='synthetic_marker'") === 1;
      database.close();
      pool.pauseVfs();
      let wrongKeyRejected = false;
      try { await open('08'.repeat(32)); }
      catch { wrongKeyRejected = true; }
      database?.close();
      pool.pauseVfs();
      postMessage({ event: 'result', preserved, reopened, wrongKeyRejected, liveHandles: liveHandles.size });
    }
  } catch (error) {
    postMessage({ event: 'error', error: String(error) });
  }
};
