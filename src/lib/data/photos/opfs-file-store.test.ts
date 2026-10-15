import { afterEach, expect, test, vi } from 'vitest';
import { opfsPhotoFiles } from './opfs-file-store';

afterEach(() => vi.unstubAllGlobals());

function storedFiles(files: Record<string, Uint8Array | Error>) {
  const directory = {
    async getFileHandle(name: string) {
      const bytes = files[name];
      if (!bytes) throw new DOMException('Missing file', 'NotFoundError');
      if (bytes instanceof Error) throw bytes;
      return { getFile: async () => ({ arrayBuffer: async () => bytes.buffer }) };
    }
  };
  const getDirectoryHandle = vi.fn(async () => directory);
  const getDirectory = vi.fn(async () => ({ getDirectoryHandle }));
  vi.stubGlobal('navigator', { storage: { getDirectory } });
  return { getDirectory, getDirectoryHandle };
}

test('batch reads preserve names, repeated names and missing files', async () => {
  const first = new Uint8Array([1, 2]);
  const second = new Uint8Array([3]);
  const { getDirectory, getDirectoryHandle } = storedFiles({ 'a.jpg': first, 'b.jpg': second });
  const store = opfsPhotoFiles('probe-photos');

  expect(await store.readMany!(['b.jpg', 'missing.jpg', 'a.jpg', 'b.jpg']))
    .toEqual([second, null, first, second]);
  expect(getDirectory).toHaveBeenCalledTimes(1);
  expect(getDirectoryHandle).toHaveBeenCalledWith('probe-photos', { create: true });
  expect(await store.read('a.jpg')).toEqual(first);
  expect(await store.read('missing.jpg')).toBeNull();
});

test('an empty batch does not open storage', async () => {
  const { getDirectory } = storedFiles({});
  expect(await opfsPhotoFiles().readMany!([])).toEqual([]);
  expect(getDirectory).not.toHaveBeenCalled();
});

test('batch reads reject storage failures rather than treating them as missing', async () => {
  const denied = new DOMException('Storage denied', 'SecurityError');
  storedFiles({ 'denied.jpg': denied });
  await expect(opfsPhotoFiles().readMany!(['missing.jpg', 'denied.jpg'])).rejects.toBe(denied);
});

test('a write the browser refuses leaves no empty file and keeps the refusal', async () => {
  /* getFileHandle({ create: true }) makes the file before a byte is written, so
     a quota refusal used to leave it behind at 0 bytes. And close() on a
     stream whose write failed rejects too, which replaced the quota error
     with a generic one (last-audit ui 37). */
  const quota = new DOMException('The quota has been exceeded.', 'QuotaExceededError');
  const names = new Set<string>();
  const abort = vi.fn(async () => {});
  const close = vi.fn(async () => {
    throw new TypeError('Cannot close a ERRORED writable stream');
  });
  const directory = {
    async getFileHandle(name: string, options?: { create?: boolean }) {
      if (options?.create) names.add(name);
      return {
        createWritable: async () => ({
          write: async () => {
            throw quota;
          },
          close,
          abort
        })
      };
    },
    async removeEntry(name: string) {
      names.delete(name);
    }
  };
  vi.stubGlobal('navigator', { storage: { getDirectory: async () => ({ getDirectoryHandle: async () => directory }) } });

  await expect(opfsPhotoFiles().write('a.jpg', new Uint8Array([1]))).rejects.toBe(quota);
  expect(names.has('a.jpg')).toBe(false);
  expect(abort).toHaveBeenCalledOnce();
  expect(close).not.toHaveBeenCalled();
});
