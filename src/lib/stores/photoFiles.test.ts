/* The batching read (phase 5 audit ticket 03).

   Counting calls against a fake store rather than timing anything: what
   the photo grid needs is that a screenful of tiles costs one round trip,
   and a stopwatch would only say that this machine is fast today.

   Every test imports the module fresh, because the store and the pending
   queue are module state - set once at boot in the app, which leaves no
   way to put either back. */

import { expect, test, vi } from 'vitest';
import type { PhotoFileStore } from '../data/journal/journal';

const bytesFor = (name: string) => new Uint8Array([name.charCodeAt(0)]);

function fakeStore(
  options: {
    readMany?: boolean;
    missing?: string[];
    unreadable?: string[];
    sizes?: Record<string, number>;
    sizeMany?: boolean;
  } = {}
) {
  const reads: string[] = [];
  const batches: string[][] = [];
  const sizeBatches: string[][] = [];
  const absent = new Set(options.missing ?? []);
  /* A file that throws rather than reading as null: what the encrypting
     store does with a ciphertext that was tampered with or written under
     another key. */
  const broken = new Set(options.unreadable ?? []);
  const sizes = options.sizes ?? {};
  const store: PhotoFileStore = {
    async write() {},
    async read(name) {
      reads.push(name);
      if (broken.has(name)) throw new Error('decryption failed');
      return absent.has(name) ? null : bytesFor(name);
    },
    async size(name) {
      return sizes[name] ?? null;
    },
    async remove() {},
    async list() {
      return [];
    }
  };
  if (options.readMany !== false) {
    store.readMany = async (names) => {
      batches.push([...names]);
      if (names.some((name) => broken.has(name))) throw new Error('decryption failed');
      return names.map((name) => (absent.has(name) ? null : bytesFor(name)));
    };
  }
  if (options.sizeMany !== false) {
    store.sizeMany = async (names) => {
      sizeBatches.push([...names]);
      return names.map((name) => sizes[name] ?? null);
    };
  }
  return { store, reads, batches, sizeBatches };
}

async function freshModule() {
  vi.resetModules();
  return import('./photoFiles');
}

test('reads issued within one frame leave as a single readMany', async () => {
  const { store, reads, batches } = fakeStore();
  const { setPhotoFiles, readThumbnail } = await freshModule();
  setPhotoFiles(store);

  const loaded = await Promise.all([
    readThumbnail('a.jpg'),
    readThumbnail('b.jpg'),
    readThumbnail('c.jpg')
  ]);

  expect(batches).toEqual([['a-thumb.jpg', 'b-thumb.jpg', 'c-thumb.jpg']]);
  expect(reads).toEqual([]);
  expect(loaded).toEqual([
    bytesFor('a-thumb.jpg'),
    bytesFor('b-thumb.jpg'),
    bytesFor('c-thumb.jpg')
  ]);
});

test('a later frame is its own batch', async () => {
  const { store, batches } = fakeStore();
  const { setPhotoFiles, readThumbnail } = await freshModule();
  setPhotoFiles(store);

  await readThumbnail('a.jpg');
  await readThumbnail('b.jpg');

  expect(batches).toEqual([['a-thumb.jpg'], ['b-thumb.jpg']]);
});

test('the same photo on two tiles is read once', async () => {
  const { store, batches } = fakeStore();
  const { setPhotoFiles, readThumbnail } = await freshModule();
  setPhotoFiles(store);

  const loaded = await Promise.all([readThumbnail('a.jpg'), readThumbnail('a.jpg')]);

  expect(batches).toEqual([['a-thumb.jpg']]);
  expect(loaded).toEqual([bytesFor('a-thumb.jpg'), bytesFor('a-thumb.jpg')]);
});

test('a store without readMany still works', async () => {
  const { store, reads } = fakeStore({ readMany: false });
  const { setPhotoFiles, readThumbnail } = await freshModule();
  setPhotoFiles(store);

  const loaded = await Promise.all([readThumbnail('a.jpg'), readThumbnail('b.jpg')]);

  expect(reads).toEqual(['a-thumb.jpg', 'b-thumb.jpg']);
  expect(loaded).toEqual([bytesFor('a-thumb.jpg'), bytesFor('b-thumb.jpg')]);
});

test('a photo whose file is gone reads null, and its neighbours still load', async () => {
  const { store } = fakeStore({ missing: ['b-thumb.jpg'] });
  const { setPhotoFiles, readThumbnail } = await freshModule();
  setPhotoFiles(store);

  expect(await Promise.all([readThumbnail('a.jpg'), readThumbnail('b.jpg')])).toEqual([
    bytesFor('a-thumb.jpg'),
    null
  ]);
});

test('before boot sets a store, every read is null', async () => {
  const { readThumbnail } = await freshModule();
  expect(await readThumbnail('a.jpg')).toBe(null);
});

test('one unreadable file fails its own tile, not the whole batch', async () => {
  /* A tampered or foreign file throws out of the store (encrypted-file-store),
     and readMany rejects as a whole - so without a per-name retry one bad
     photo would blank every tile that happened to load beside it. */
  const { store, reads, batches } = fakeStore({ unreadable: ['b-thumb.jpg'] });
  const { setPhotoFiles, readThumbnail } = await freshModule();
  setPhotoFiles(store);

  const results = await Promise.allSettled([readThumbnail('a.jpg'), readThumbnail('b.jpg')]);

  expect(results[0]).toEqual({ status: 'fulfilled', value: bytesFor('a-thumb.jpg') });
  expect(results[1].status).toBe('rejected');
  expect(batches).toEqual([['a-thumb.jpg', 'b-thumb.jpg']]);
  expect(reads).toEqual(['a-thumb.jpg', 'b-thumb.jpg']);
});

test('the total size of a batch of files, summed in one call where the store offers it', async () => {
  const { store, sizeBatches } = fakeStore({ sizes: { 'a.pdf': 1000, 'b.jpg': 2500 } });
  const { setPhotoFiles, totalSize } = await freshModule();
  setPhotoFiles(store);

  expect(await totalSize(['a.pdf', 'b.jpg'])).toBe(3500);
  expect(sizeBatches).toEqual([['a.pdf', 'b.jpg']]);
});

test('a store with no sizeMany is summed one name at a time', async () => {
  const { store } = fakeStore({ sizeMany: false, sizes: { 'a.pdf': 1000, 'b.jpg': 2500 } });
  const { setPhotoFiles, totalSize } = await freshModule();
  setPhotoFiles(store);

  expect(await totalSize(['a.pdf', 'b.jpg'])).toBe(3500);
});

test('a missing file counts as nothing, not as a failure of the whole sum', async () => {
  const { store } = fakeStore({ sizes: { 'a.pdf': 1000 } });
  const { setPhotoFiles, totalSize } = await freshModule();
  setPhotoFiles(store);

  expect(await totalSize(['a.pdf', 'gone.pdf'])).toBe(1000);
});

test('no names is 0 without asking the store anything', async () => {
  const { store, sizeBatches } = fakeStore();
  const { setPhotoFiles, totalSize } = await freshModule();
  setPhotoFiles(store);

  expect(await totalSize([])).toBe(0);
  expect(sizeBatches).toEqual([]);
});

test('before boot sets a store, the total is 0', async () => {
  const { totalSize } = await freshModule();
  expect(await totalSize(['a.pdf'])).toBe(0);
});
