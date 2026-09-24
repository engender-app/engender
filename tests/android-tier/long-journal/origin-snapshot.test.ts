/* The long-journal probe puts the app's origin back the way it found it
   (ux-carpet 216). */

import assert from 'node:assert/strict';
import { test } from 'vitest';
import { snapshotOrigin, type OriginDirectory, type OriginFile, type OriginStorage } from './origin-snapshot.ts';

const bytes = (text: string) => new TextEncoder().encode(text).buffer as ArrayBuffer;
const text = (buffer: ArrayBuffer) => new TextDecoder().decode(buffer);

function fakeRoot(initial: Record<string, string>, dirs: string[] = []) {
  const files = new Map(Object.entries(initial).map(([k, v]) => [k, bytes(v)]));
  const directories = new Set(dirs);
  const handle = (name: string): OriginFile => ({
    kind: 'file',
    getFile: async () => ({ arrayBuffer: async () => files.get(name) ?? new ArrayBuffer(0) }),
    createWritable: async () => ({
      write: async (data: ArrayBuffer) => void files.set(name, data),
      close: async () => {}
    })
  });
  const root: OriginDirectory = {
    async *entries() {
      for (const name of [...files.keys()]) yield [name, handle(name)];
      for (const name of [...directories]) yield [name, { kind: 'directory' as const }];
    },
    getFileHandle: async (name, options) => {
      if (!files.has(name)) {
        if (!options?.create) throw new Error('NotFoundError');
        files.set(name, new ArrayBuffer(0));
      }
      return handle(name);
    },
    removeEntry: async (name) => {
      files.delete(name);
      directories.delete(name);
    }
  };
  return { root, files, directories };
}

function fakeStorage(initial: Record<string, string>): OriginStorage & { map: Map<string, string> } {
  const map = new Map(Object.entries(initial));
  return {
    map,
    get length() {
      return map.size;
    },
    key: (i) => [...map.keys()][i] ?? null,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k)
  };
}

test("an unlocked phone's empty origin comes back empty after the probe wrote a keystore", async () => {
  const { root, files } = fakeRoot({});
  const storage = fakeStorage({ 'engender-boot-prefs': '{"theme":"dark"}' });
  const restore = await snapshotOrigin(root, storage);

  // What the benchmark does in between.
  await (await root.getFileHandle('keystore.json', { create: true })).createWritable().then(async (w) => {
    await w.write(bytes('{"probe":"keystore"}'));
    await w.close();
  });
  storage.setItem('engender-boot-cache', 'probe');
  storage.setItem('engender-boot-prefs', '{"theme":"light"}');

  const changed = await restore();

  assert.deepEqual([...files.keys()], []);
  assert.deepEqual(Object.fromEntries(storage.map), { 'engender-boot-prefs': '{"theme":"dark"}' });
  assert.deepEqual(changed, [
    'removed keystore.json',
    'removed localStorage engender-boot-cache',
    'restored localStorage engender-boot-prefs'
  ]);
});

test("a passphrase phone's own keystore gets its bytes back, and an untouched origin reports nothing", async () => {
  const { root, files, directories } = fakeRoot({ 'keystore.json': 'the person’s keystore' }, ['pool']);
  const storage = fakeStorage({});
  const restore = await snapshotOrigin(root, storage);

  const w = await (await root.getFileHandle('keystore.json')).createWritable();
  await w.write(bytes('the probe’s keystore'));
  await w.close();

  assert.deepEqual(await restore(), ['restored keystore.json']);
  assert.equal(text(files.get('keystore.json')!), 'the person’s keystore');
  assert.ok(directories.has('pool'), 'a directory that was there stays');
  assert.deepEqual(await restore(), []);
});
