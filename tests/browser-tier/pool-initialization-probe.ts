import { freshOrigin } from './fresh-origin';
import { publish } from '../probe-handshake.mjs';

interface Event {
  event: string;
  error?: string;
  liveHandles?: number;
  acquiredAfterContention?: number;
  preserved?: boolean;
  reopened?: boolean;
  wrongKeyRejected?: boolean;
}

async function collision(scenario: string) {
  const owner = new Worker(new URL('./pool-initialization-worker.ts', import.meta.url), { type: 'module' });
  const contender = new Worker(new URL('./pool-initialization-worker.ts', import.meta.url), { type: 'module' });
  const events: (Event & { role: string })[] = [];
  let releasing = false;
  let released = false;
  try {
    return await new Promise<{ result: Event; events: typeof events }>((resolve, reject) => {
      const release = () => {
        if (released) contender.postMessage({ command: 'owner-released' });
        else if (!releasing) { releasing = true; owner.postMessage({ command: 'release' }); }
      };
      for (const [role, worker] of [['owner', owner], ['contender', contender]] as const) {
        worker.onerror = (error) => reject(new Error(error.message));
        worker.onmessage = ({ data }: MessageEvent<Event>) => {
          events.push({ role, ...data });
          if (data.event === 'seeded') contender.postMessage({ command: 'contend', role: 'contender', scenario });
          if (data.event === 'destructive-cleanup' || data.event === 'attach-failed' ||
              (scenario === 'late-acquisition' && data.event === 'contention')) release();
          if (data.event === 'released') {
            released = true;
            owner.terminate();
            contender.postMessage({ command: 'owner-released' });
          }
          if (data.event === 'error') reject(new Error(data.error));
          if (data.event === 'result') resolve({ result: data, events });
        };
      }
      owner.postMessage({ command: 'seed', role: 'owner', scenario });
    });
  } finally {
    owner.terminate();
    contender.terminate();
  }
}

async function workerFailure() {
  type Reply = { id: number; ok: boolean; result?: unknown; error?: string; acquisitions: number; ready?: boolean };
  async function connection() {
    const worker = new Worker(new URL('./pool-driver-worker.ts', import.meta.url), { type: 'module' });
    const pending = new Map<number, (reply: Reply) => void>();
    let nextId = 0;
    await new Promise<void>((resolve, reject) => {
      worker.onerror = (event) => reject(new Error(event.message));
      worker.onmessage = ({ data }: MessageEvent<Reply>) => {
        if (data.ready) resolve();
        else { pending.get(data.id)?.(data); pending.delete(data.id); }
      };
    });
    return {
      worker,
      post(op: string, args?: Record<string, unknown>): Promise<Reply> {
        const id = nextId++;
        return new Promise((resolve) => { pending.set(id, resolve); worker.postMessage({ id, op, args }); });
      }
    };
  }
  const owner = await connection();
  const contender = await connection();
  const path = 'pool-driver-synthetic.sqlite3';
  const args = { path, hexKey: '07'.repeat(32) };
  try {
    for (const reply of [
      await owner.post('open', args),
      await owner.post('exec', { sql: "CREATE TABLE marker(value TEXT); INSERT INTO marker VALUES ('preserve this journal')" })
    ]) if (!reply.ok) throw new Error(reply.error);
    const replies = await Promise.all([
      contender.post('attach', { path }),
      contender.post('open', args),
      contender.post('query', { sql: 'SELECT value FROM marker', params: [] })
    ]);
    const latched = replies.every((reply) => !reply.ok && reply.error === replies[0].error && reply.acquisitions === replies[0].acquisitions);
    await contender.post('close');
    const live = await owner.post('query', { sql: 'SELECT value FROM marker', params: [] });
    await owner.post('close');
    const reopened = await connection();
    try {
      const opened = await reopened.post('open', args);
      const saved = await reopened.post('query', { sql: 'SELECT value FROM marker', params: [] });
      await reopened.post('close');
      const expected = JSON.stringify([{ value: 'preserve this journal' }]);
      return { latched, replies, preserved: live.ok && opened.ok && saved.ok && JSON.stringify(live.result) === expected && JSON.stringify(saved.result) === expected };
    } finally { reopened.worker.terminate(); }
  } finally {
    owner.worker.terminate();
    contender.worker.terminate();
  }
}

try {
  await freshOrigin();
  const teardown = await collision('teardown-at-cleanup');
  const late = await collision('late-acquisition');
  const driver = await workerFailure();
  publish('pool-initialization', { teardown, late, driver });
} catch (error) {
  publish('pool-initialization', { error: String(error) });
}
