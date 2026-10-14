import { freshOrigin } from './fresh-origin';
import { publish } from '../probe-handshake.mjs';

type Reply = { id: number; ok: boolean; result?: unknown; error?: string };

function connection() {
  const worker = new Worker(new URL('../../src/lib/data/sqlite/mc-worker.ts', import.meta.url), { type: 'module' });
  const pending = new Map<number, { resolve(reply: Reply): void; reject(error: Error): void }>();
  let nextId = 0;
  worker.onmessage = ({ data }: MessageEvent<Reply>) => {
    pending.get(data.id)?.resolve(data);
    pending.delete(data.id);
  };
  worker.onerror = (event) => {
    for (const request of pending.values()) request.reject(new Error(event.message));
    pending.clear();
  };
  const post = (op: string, args?: Record<string, unknown>): Promise<Reply> => new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    worker.postMessage({ id, op, args });
  });
  return {
    worker, post,
    async request(op: string, args?: Record<string, unknown>) {
      const reply = await post(op, args);
      if (!reply.ok) throw new Error(reply.error);
      return reply.result;
    }
  };
}

// Pool filenames live in their own header. Inspect bytes without changing them.
async function slots() {
  const root = await navigator.storage.getDirectory();
  const found: { name: string; bytes: number; hash: string }[] = [];
  async function scan(directory: FileSystemDirectoryHandle) {
    for await (const [, handle] of (directory as unknown as { entries(): AsyncIterableIterator<[string, FileSystemHandle]> }).entries()) {
      if (handle.kind === 'directory') await scan(handle as FileSystemDirectoryHandle);
      else {
        const bytes = new Uint8Array(await (await (handle as FileSystemFileHandle).getFile()).arrayBuffer());
        const name = new TextDecoder().decode(bytes.subarray(0, bytes.indexOf(0)));
        if (!name.startsWith('/')) continue;
        const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))).map((b) => b.toString(16).padStart(2, '0')).join('');
        found.push({ name, bytes: bytes.length, hash });
      }
    }
  }
  await scan(root);
  return found;
}

async function recovery() {
  const path = 'hot-journal-synthetic.sqlite3';
  const args = { path, hexKey: '07'.repeat(32) };
  const query = { sql: 'SELECT count(*) AS n, sum(length(value)) AS bytes FROM marker', params: [] };
  const seed = connection();
  try {
    await seed.request('open', args);
    await seed.request('exec', { sql: "CREATE TABLE marker(id INTEGER PRIMARY KEY, value TEXT); WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x+1 FROM n WHERE x<512) INSERT INTO marker SELECT x, 'before-' || x FROM n" });
    await seed.request('close');
  } finally { seed.worker.terminate(); }
  const before = await slots();
  const writer = connection();
  const contender = connection();
  let contention = false;
  let inside: unknown;
  try {
    await writer.request('open', args);
    await writer.request('exec', { sql: "PRAGMA cache_size=2; BEGIN; UPDATE marker SET value = 'uncommitted-' || hex(randomblob(1024))" });
    inside = await writer.request('query', query);
    const rejected = await contender.post('open', args);
    contention = !rejected.ok && Boolean(rejected.error?.includes('Access Handles cannot be created'));
    await contender.request('close');
    // No close or rollback: terminating the worker leaves its spilled write.
  } finally { writer.worker.terminate(); contender.worker.terminate(); }
  const interrupted = await slots();
  const reopened = connection();
  try {
    await reopened.request('open', args);
    const after = await reopened.request('query', query);
    const integrity = await reopened.request('query', { sql: 'PRAGMA integrity_check', params: [] });
    const marked = await reopened.request('query', { sql: "SELECT count(*) AS n FROM marker WHERE value LIKE 'uncommitted-%'", params: [] });
    await reopened.request('close');
    return { before, interrupted, inside, after, integrity, marked, contention, recovered: await slots() };
  } finally { reopened.worker.terminate(); }
}

async function lockStates() {
  const worker = new Worker(new URL('./hot-journal-lock-worker.ts', import.meta.url), { type: 'module' });
  try {
    return await new Promise<{ locks?: number[]; error?: string }>((resolve, reject) => {
      worker.onmessage = ({ data }) => resolve(data);
      worker.onerror = (event) => reject(new Error(event.message));
    });
  } finally { worker.terminate(); }
}

try {
  await freshOrigin();
  const locks = await lockStates();
  publish('hot-journal', { locks, recovery: await recovery() });
} catch (error) { publish('hot-journal', { error: String(error) }); }
