import { test, expect, vi, afterEach } from 'vitest';
import { KEYSTORE_FILE, readKeystoreText, readKeystoreFile, writeKeystoreFile, removeKeystoreFile } from './keystore-file.ts';
import { createKeystore, serializeKeystore } from '../crypto/keystore.ts';

const native = vi.hoisted(() => ({
  readCredential: vi.fn(), adoptCredential: vi.fn(), writeCredential: vi.fn(), removeCredential: vi.fn()
}));
vi.mock('../android/plugin-registry', () => ({
  androidPluginOwners: { keystore: 'keystore' }, registerAndroidPlugin: () => native
}));
afterEach(() => { vi.unstubAllGlobals(); vi.resetAllMocks(); });

const android = () => vi.stubGlobal('window', { Capacitor: { getPlatform: () => 'android' } });

/* A fake OPFS root logging createWritable/write/close/abort in order, the
   same shape reset.test.ts already uses for its own fake directory. A
   write can be made to reject mid-flight to drive the crash-safety case
   this file exists to prove: unlike a real OPFS write, this fake commits
   nothing until close(), so a test that only checked the returned promise
   would not catch a `finally { close() }` publishing the empty write. */
function fakeRoot(options: { writeFails?: boolean } = {}) {
  const log: string[] = [];
  const files: Record<string, string> = {};
  return {
    log,
    files,
    root: {
      async removeEntry(name: string) { delete files[name]; log.push('remove'); },
      async getFileHandle(name: string, opts?: { create?: boolean }) {
        if (!(name in files) && !opts?.create) {
          throw Object.assign(new Error('not found'), { name: 'NotFoundError' });
        }
        let pending = '';
        return {
          async getFile() {
            return { text: async () => files[name] };
          },
          async createWritable() {
            log.push('createWritable');
            return {
              async write(data: string) {
                log.push('write');
                if (options.writeFails) throw new Error('quota exceeded');
                pending = data;
              },
              async close() {
                log.push('close');
                files[name] = pending;
              },
              async abort() {
                log.push('abort');
              }
            };
          }
        };
      }
    }
  };
}

test('a write that throws aborts rather than closes, leaving the previous keystore intact', async () => {
  const { metadata } = await createKeystore('first passphrase');
  const { root, log, files } = fakeRoot({ writeFails: true });
  files[KEYSTORE_FILE] = 'the-previous-keystore';
  vi.stubGlobal('navigator', { storage: { getDirectory: async () => root } });

  await expect(writeKeystoreFile(metadata)).rejects.toThrow('quota exceeded');

  expect(log).toEqual(['createWritable', 'write', 'abort']);
  expect(files[KEYSTORE_FILE]).toBe('the-previous-keystore');
  vi.unstubAllGlobals();
});

test('a successful write records createWritable, write, close and reads back', async () => {
  const { metadata } = await createKeystore('second passphrase');
  const { root, log } = fakeRoot();
  vi.stubGlobal('navigator', { storage: { getDirectory: async () => root } });

  await writeKeystoreFile(metadata);
  expect(log).toEqual(['createWritable', 'write', 'close']);
  await expect(readKeystoreFile()).resolves.toEqual(metadata);
  vi.unstubAllGlobals();
});

test('Android waits for native persistence and never opens OPFS for a new write', async () => {
  android();
  const { metadata } = await createKeystore('native passphrase');
  let resolve!: () => void;
  native.writeCredential.mockReturnValue(new Promise<void>((done) => { resolve = done; }));
  const root = vi.fn();
  vi.stubGlobal('navigator', { storage: { getDirectory: root } });
  let confirmed = false;
  const write = writeKeystoreFile(metadata).then(() => { confirmed = true; });
  await Promise.resolve();
  expect(confirmed).toBe(false);
  expect(root).not.toHaveBeenCalled();
  resolve();
  await write;
  expect(confirmed).toBe(true);
  expect(native.writeCredential).toHaveBeenCalledWith({ serialized: serializeKeystore(metadata) });
});

test('Android persistence errors reject without publishing an OPFS fallback', async () => {
  android();
  const { metadata } = await createKeystore('native failure');
  native.writeCredential.mockRejectedValue(new Error('fsync failed'));
  const root = vi.fn();
  vi.stubGlobal('navigator', { storage: { getDirectory: root } });
  await expect(writeKeystoreFile(metadata)).rejects.toThrow('fsync failed');
  expect(root).not.toHaveBeenCalled();
});

test('released OPFS wrap is validated and adopted before its only copy is removed', async () => {
  android();
  const { metadata } = await createKeystore('released passphrase');
  const { root, files, log } = fakeRoot();
  files[KEYSTORE_FILE] = serializeKeystore(metadata);
  vi.stubGlobal('navigator', { storage: { getDirectory: async () => root } });
  native.readCredential.mockResolvedValue({ initialized: false });
  native.adoptCredential.mockImplementation(async () => {
    expect(files[KEYSTORE_FILE]).toBe(serializeKeystore(metadata));
    return { initialized: true, serialized: serializeKeystore(metadata) };
  });
  await expect(readKeystoreFile()).resolves.toEqual(metadata);
  expect(log).toEqual(['remove']);
  expect(files[KEYSTORE_FILE]).toBeUndefined();
});

test('failed adoption leaves the released OPFS wrap for a restart', async () => {
  android();
  const { metadata } = await createKeystore('adoption failure');
  const { root, files } = fakeRoot();
  files[KEYSTORE_FILE] = serializeKeystore(metadata);
  vi.stubGlobal('navigator', { storage: { getDirectory: async () => root } });
  native.readCredential.mockResolvedValue({ initialized: false });
  native.adoptCredential.mockRejectedValue(new Error('disk full'));
  await expect(readKeystoreFile()).rejects.toThrow('disk full');
  expect(files[KEYSTORE_FILE]).toBe(serializeKeystore(metadata));
});

test('native record and removal marker never fall back to stale released OPFS credentials', async () => {
  android();
  const { metadata } = await createKeystore('current credential');
  const root = vi.fn();
  vi.stubGlobal('navigator', { storage: { getDirectory: root } });
  native.readCredential.mockResolvedValue({ initialized: true, serialized: serializeKeystore(metadata) });
  await expect(readKeystoreFile()).resolves.toEqual(metadata);
  native.readCredential.mockResolvedValue({ initialized: true });
  await expect(readKeystoreFile()).resolves.toBeNull();
  expect(root).not.toHaveBeenCalled();
});

test('malformed native metadata refuses rather than reviving an old wrap', async () => {
  android();
  native.readCredential.mockResolvedValue({ initialized: true, serialized: '{}' });
  const root = vi.fn();
  vi.stubGlobal('navigator', { storage: { getDirectory: root } });
  await expect(readKeystoreFile()).rejects.toThrow();
  expect(root).not.toHaveBeenCalled();
});

test('native tombstone commits before legacy removal and a failure preserves legacy bytes', async () => {
  android();
  const { root, files } = fakeRoot();
  files[KEYSTORE_FILE] = 'old wrap';
  vi.stubGlobal('navigator', { storage: { getDirectory: async () => root } });
  native.removeCredential.mockRejectedValue(new Error('directory fsync failed'));
  await expect(removeKeystoreFile()).rejects.toThrow('directory fsync failed');
  expect(files[KEYSTORE_FILE]).toBe('old wrap');
  native.removeCredential.mockImplementation(async () => { expect(files[KEYSTORE_FILE]).toBe('old wrap'); });
  await removeKeystoreFile();
  expect(files[KEYSTORE_FILE]).toBeUndefined();
});

test('credential presence respects native tombstones without reading stale OPFS', async () => {
  android();
  native.readCredential.mockResolvedValue({ initialized: true });
  const readOpfs = vi.fn(() => { throw new Error('stale OPFS must not be consulted'); });
  vi.stubGlobal('navigator', { storage: { getDirectory: readOpfs } });
  const { keystoreFileExists } = await import('./keystore-file');
  await expect(keystoreFileExists()).resolves.toBe(false);
  expect(readOpfs).not.toHaveBeenCalled();
});

test('malformed authoritative credentials still block key initialization', async () => {
  android();
  native.readCredential.mockResolvedValue({ initialized: true, serialized: '{broken' });
  const { keystoreFileExists } = await import('./keystore-file');
  await expect(keystoreFileExists()).resolves.toBe(true);
});

test('boot distinguishes malformed wraps from absence and unexpected storage failures', async () => {
  android();
  const { readKeystoreSourceForBoot } = await import('./keystore-file');
  native.readCredential.mockResolvedValue({ initialized: true, serialized: '{broken' });
  await expect(readKeystoreSourceForBoot()).resolves.toBe('unreadable');
  native.readCredential.mockResolvedValue({ initialized: true });
  await expect(readKeystoreSourceForBoot()).resolves.toBeNull();
  native.readCredential.mockRejectedValue(new Error('storage denied'));
  await expect(readKeystoreSourceForBoot()).rejects.toThrow('storage denied');
});

test('cancellation before the OPFS commit keeps the previous credential', async () => {
  const { metadata } = await createKeystore('synthetic replacement');
  const { root, log, files } = fakeRoot();
  files[KEYSTORE_FILE] = 'previous';
  vi.stubGlobal('navigator', { storage: { getDirectory: async () => root } });
  const current = () => { if (log.includes('write')) throw new Error('cancelled'); };
  await expect(writeKeystoreFile(metadata, current)).rejects.toThrow('cancelled');
  expect(log).toEqual(['createWritable', 'write', 'abort']);
  expect(files[KEYSTORE_FILE]).toBe('previous');
});

test('revoked approval never dispatches an Android credential write', async () => {
  android();
  const { metadata } = await createKeystore('synthetic native replacement');
  await expect(writeKeystoreFile(metadata, () => { throw new Error('cancelled'); })).rejects.toThrow('cancelled');
  expect(native.writeCredential).not.toHaveBeenCalled();
});


test('approval identity includes malformed OPFS wraps without parsing or altering them', async () => {
  const { root, files, log } = fakeRoot();
  files[KEYSTORE_FILE] = '{broken';
  vi.stubGlobal('navigator', { storage: { getDirectory: async () => root } });
  await expect(readKeystoreText()).resolves.toBe('{broken');
  expect(log).toEqual([]);
  delete files[KEYSTORE_FILE];
  await expect(readKeystoreText()).resolves.toBeNull();
});

test('approval identity uses native malformed bytes or tombstone without reviving OPFS', async () => {
  android();
  const opfs = vi.fn(() => { throw new Error('stale OPFS must not be consulted'); });
  vi.stubGlobal('navigator', { storage: { getDirectory: opfs } });
  native.readCredential.mockResolvedValue({ initialized: true, serialized: '{broken' });
  await expect(readKeystoreText()).resolves.toBe('{broken');
  native.readCredential.mockResolvedValue({ initialized: true });
  await expect(readKeystoreText()).resolves.toBeNull();
  expect(opfs).not.toHaveBeenCalled();
  expect(native.adoptCredential).not.toHaveBeenCalled();
});

test('approval identity reads malformed legacy bytes without adopting them', async () => {
  android();
  native.readCredential.mockResolvedValue({ initialized: false });
  const { root, files, log } = fakeRoot();
  files[KEYSTORE_FILE] = '{legacy broken';
  vi.stubGlobal('navigator', { storage: { getDirectory: async () => root } });
  await expect(readKeystoreText()).resolves.toBe('{legacy broken');
  expect(log).toEqual([]);
  expect(native.adoptCredential).not.toHaveBeenCalled();
});
