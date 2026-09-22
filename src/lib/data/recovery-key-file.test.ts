import { test, expect, vi } from 'vitest';
import { RECOVERY_KEY_FILE, readRecoveryWrapFile, writeRecoveryWrapFile } from './recovery-key-file.ts';
import { wrapDataKeyWithRecoveryKey } from '../crypto/recoveryWrap.ts';
import { generateRecoveryKey } from '../crypto/recoveryKey.ts';

/* Same fake OPFS root as keystore-file.test.ts, kept as its own copy for
   the same reason the two source files are: this one only has to serve
   writeRecoveryWrapFile/readRecoveryWrapFile. */
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

test('a write that throws aborts rather than closes, leaving the previous recovery key intact', async () => {
  const wrap = await wrapDataKeyWithRecoveryKey(crypto.getRandomValues(new Uint8Array(32)), generateRecoveryKey());
  const { root, log, files } = fakeRoot({ writeFails: true });
  files[RECOVERY_KEY_FILE] = 'the-previous-recovery-key';
  vi.stubGlobal('navigator', { storage: { getDirectory: async () => root } });

  await expect(writeRecoveryWrapFile(wrap)).rejects.toThrow('quota exceeded');

  expect(log).toEqual(['createWritable', 'write', 'abort']);
  expect(files[RECOVERY_KEY_FILE]).toBe('the-previous-recovery-key');
  vi.unstubAllGlobals();
});

test('a successful write records createWritable, write, close and reads back', async () => {
  const wrap = await wrapDataKeyWithRecoveryKey(crypto.getRandomValues(new Uint8Array(32)), generateRecoveryKey());
  const { root, log } = fakeRoot();
  vi.stubGlobal('navigator', { storage: { getDirectory: async () => root } });

  await writeRecoveryWrapFile(wrap);
  expect(log).toEqual(['createWritable', 'write', 'close']);
  await expect(readRecoveryWrapFile()).resolves.toEqual(wrap);
  vi.unstubAllGlobals();
});
