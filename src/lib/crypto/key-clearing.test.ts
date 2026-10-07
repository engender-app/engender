import { afterEach, expect, test, vi } from 'vitest';

const cryptoOps = vi.hoisted(() => ({ deriveKey: vi.fn(), encrypt: vi.fn(), decrypt: vi.fn() }));
vi.mock('./argon2id.ts', () => ({ deriveKey: cryptoOps.deriveKey, randomSalt: () => new Uint8Array(16) }));
vi.mock('./aesGcm.ts', () => ({ encrypt: cryptoOps.encrypt, decrypt: cryptoOps.decrypt }));
import { wrapDataKey, unwrapDataKey, rewrapKeystore } from './keystore.ts';

const params = { memorySize: 32, iterations: 1, parallelism: 1, hashLength: 32 };
const wrap = { kdf: 'argon2id' as const, params, salt: new Uint8Array(16), nonce: new Uint8Array(12), wrappedKey: new Uint8Array(48) };
afterEach(() => vi.resetAllMocks());

test.each([false, true])('wrapping clears its derived key even when encryption fails: %s', async (fails) => {
  const key = new Uint8Array(32).fill(7);
  const dataKey = new Uint8Array(32).fill(9);
  cryptoOps.deriveKey.mockResolvedValue(key);
  cryptoOps.encrypt.mockImplementation(async () => {
    expect(key[0]).toBe(7);
    if (fails) throw new Error('encryption failed');
    return { nonce: wrap.nonce, ciphertext: wrap.wrappedKey };
  });
  const result = wrapDataKey(dataKey, 'secret', params);
  if (fails) await expect(result).rejects.toThrow('encryption failed');
  else await result;
  expect(key.every((byte) => byte === 0)).toBe(true);
  expect(dataKey[0]).toBe(9);
});

test.each([false, true])('unwrapping clears its derived key even when authentication fails: %s', async (fails) => {
  const key = new Uint8Array(32).fill(7);
  cryptoOps.deriveKey.mockResolvedValue(key);
  cryptoOps.decrypt.mockImplementation(async () => {
    expect(key[0]).toBe(7);
    if (fails) throw new Error('wrong secret');
    return new Uint8Array(32).fill(9);
  });
  const result = unwrapDataKey(wrap, 'secret');
  if (fails) await expect(result).rejects.toThrow('wrong secret');
  else expect((await result)[0]).toBe(9);
  expect(key.every((byte) => byte === 0)).toBe(true);
});

test.each([false, true])('rewrapping clears its temporary data key on success and failure: %s', async (fails) => {
  const dataKey = new Uint8Array(32).fill(9);
  cryptoOps.deriveKey.mockImplementation(async () => new Uint8Array(32).fill(7));
  cryptoOps.decrypt.mockResolvedValue(dataKey);
  cryptoOps.encrypt.mockImplementation(async (_key, plaintext) => {
    expect(plaintext[0]).toBe(9);
    if (fails) throw new Error('encryption failed');
    return { nonce: wrap.nonce, ciphertext: wrap.wrappedKey };
  });
  const result = rewrapKeystore({ ...wrap, version: 2, secretSource: 'passphrase' }, 'old', 'new', params);
  if (fails) await expect(result).rejects.toThrow('encryption failed');
  else await result;
  expect(dataKey.every((byte) => byte === 0)).toBe(true);
});
