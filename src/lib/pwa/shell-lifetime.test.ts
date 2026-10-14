import { describe, expect, test } from 'vitest';
import { createShellLifetime, retainedShellAsset, SHELL_CLIENTS } from './shell-lifetime';

const origin = 'https://journal.example';
const A = 'engender-shell-A';
const B = 'engender-shell-B';
const C = 'engender-shell-C';
const asset = '/_app/immutable/chunks/old.js';

function fixture() {
  let refused: string | undefined;
  const data = new Map<string, Map<string, Response>>();
  const key = (request: Request | string) => new URL(typeof request === 'string' ? request : request.url, origin).href;
  const caches = {
    keys: async () => [...data.keys()],
    delete: async (name: string) => data.delete(name),
    open: async (name: string) => {
      const rows = data.get(name) ?? new Map();
      data.set(name, rows);
      return {
        keys: async () => [...rows.keys()].map(url => new Request(url)),
        match: async (request: Request | string) => rows.get(key(request))?.clone(),
        put: async (request: Request | string, response: Response) => {
          if (name === refused) throw new Error('receipt persistence refused');
          rows.set(key(request), response.clone());
        },
        delete: async (request: Request | string) => rows.delete(key(request))
      };
    }
  } as unknown as CacheStorage;
  let clients = ['old-one', 'old-two'];
  const clientStore = { matchAll: async () => clients.map(id => ({ id })) };
  const owner = (current: string) => createShellLifetime(caches, clientStore, current, '', origin);
  const put = async (name: string, path: string, body: string) => (await caches.open(name)).put(origin + path, new Response(body));
  return { caches, owner, put, refuseWrites: (name?: string) => { refused = name; }, setClients: (ids: string[]) => { clients = ids; } };
}

describe('retained shell lifetime', () => {
  test.each([asset, '/_app/immutable/workers/mc-worker-old.js',
    '/_app/immutable/workers/pdf-worker-old.js', '/_app/immutable/assets/sqlite.old.wasm'])
  ('retains and serves already-cached immutable bytes across takeover: %s', async path => {
    const f = fixture();
    await f.put(A, path, 'release A');
    await f.put(B, '/', 'release B document');
    await f.put('foreign-cache', asset, 'foreign');
    await f.owner(B).activate();
    expect(await (await retainedShellAsset(f.caches, B, new Request(origin + path), '', origin))!.text()).toBe('release A');
    expect(await retainedShellAsset(f.caches, B, new Request(origin + '/'), '', origin)).toBeUndefined();
    expect(await f.caches.keys()).toContain('foreign-cache');
  });

  test('keeps several generations only while their own clients remain, across owner restarts', async () => {
    const f = fixture();
    await f.put(A, asset, 'A');
    await f.owner(A).activate();
    await f.owner(A).release('old-one', 'A');
    await f.owner(A).release('old-two', 'A');
    await f.put(B, '/_app/immutable/chunks/b.js', 'B');
    await f.owner(B).activate();
    f.setClients(['old-one', 'old-two', 'middle']);
    await f.owner(B).release('middle', 'B');
    await f.put(C, '/_app/immutable/chunks/c.js', 'C');
    await f.owner(C).activate();
    f.setClients(['old-two', 'middle', 'new']);
    await f.owner(C).release('new', 'C');
    expect(await f.caches.keys()).toEqual([A, B, C]);
    f.setClients(['middle', 'new']);
    await f.owner(C).collect();
    expect(await f.caches.keys()).toEqual([B, C]);
    await f.owner(C).release('middle', 'C');
    expect(await f.caches.keys()).toEqual([C]);
  });

  test('leaves an installing cache untouched and unavailable to the active fetch path', async () => {
    const f = fixture();
    await f.put(A, asset, 'A');
    await f.owner(A).activate();
    await f.put(B, '/_app/immutable/chunks/future.js', 'future');
    await f.owner(A).collect();
    expect(await f.caches.keys()).toEqual([A, B]);
    expect(await retainedShellAsset(f.caches, A, new Request(origin + '/_app/immutable/chunks/future.js'), '', origin)).toBeUndefined();
  });

  test('an outgoing worker cannot collect a successor that has already activated', async () => {
    const f = fixture();
    await f.put(A, asset, 'A');
    const outgoing = f.owner(A);
    await outgoing.activate();
    await f.put(B, '/_app/immutable/chunks/b.js', 'B');
    await f.owner(B).activate();
    await outgoing.collect();
    expect(await (await f.caches.open(B)).match(origin + '/_app/immutable/chunks/b.js')).toBeDefined();
  });

  test('retains OCR compatibility bytes after reclaiming an obsolete shell', async () => {
    const f = fixture();
    await f.put(A, asset, 'A');
    await f.put(A, '/tesseract/generation/worker.js', 'old OCR');
    await f.owner(A).activate();
    await f.put(B, '/', 'B');
    await f.owner(B).activate();
    f.setClients([]);
    await f.owner(B).collect();
    const paths = (await (await f.caches.open(A)).keys()).map(request => new URL(request.url).pathname);
    expect(paths).toEqual(['/tesseract/generation/worker.js']);
    expect(await (await f.caches.open(A)).match(origin + SHELL_CLIENTS)).toBeUndefined();
  });

  test('failed destination persistence keeps old protection and later operations can retry', async () => {
    const f = fixture();
    await f.put(A, asset, 'A');
    await f.put(B, '/', 'B');
    const owner = f.owner(B);
    await owner.activate();
    f.refuseWrites(B);
    await expect(owner.release('old-one', 'B')).rejects.toThrow('receipt persistence refused');
    expect(await (await f.caches.open(A)).match(origin + asset)).toBeDefined();
    f.refuseWrites();
    await owner.release('old-one', 'B');
    f.setClients(['old-one']);
    await owner.collect();
    expect(await f.caches.keys()).toEqual([B]);
  });

  test('an unknown or uninstalled reported release cannot drop retained protection', async () => {
    const f = fixture();
    await f.put(A, asset, 'A');
    await f.put(B, '/', 'B');
    await f.owner(B).activate();
    await f.owner(B).release('old-one', 'not-installed');
    expect(await f.caches.keys()).toEqual([A, B]);
    expect(await (await f.caches.open(A)).match(origin + asset)).toBeDefined();
  });
});
