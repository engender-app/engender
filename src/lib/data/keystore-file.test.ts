import { test, expect, vi } from 'vitest';
import { KEYSTORE_FILE, readKeystoreFile, writeKeystoreFile } from './keystore-file.ts';
import { createKeystore } from '../crypto/keystore.ts';

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
