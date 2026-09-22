import { test, expect } from 'vitest';
import { encrypt, decrypt, seal, open, SEAL_OVERHEAD, DecryptionFailedError } from './aesGcm.ts';
import { capturedConsoleOutput } from './test-support/capture-console.ts';

function makeKey() {
  return crypto.getRandomValues(new Uint8Array(32));
}

test('round-trips plaintext through encrypt then decrypt', async () => {
  const key = makeKey();
  const plaintext = new TextEncoder().encode('the whole archive, folded and tagged');
  const { nonce, ciphertext } = await encrypt(key, plaintext);
  const decrypted = await decrypt(key, nonce, ciphertext);
  expect(new TextDecoder().decode(decrypted)).toBe('the whole archive, folded and tagged');
});

test('uses a fresh nonce on every call', async () => {
  const key = makeKey();
  const plaintext = new TextEncoder().encode('same plaintext both times');
  const a = await encrypt(key, plaintext);
  const b = await encrypt(key, plaintext);
  expect(a.nonce).not.toEqual(b.nonce);
  expect(a.ciphertext).not.toEqual(b.ciphertext);
});

test('rejects the wrong key with DecryptionFailedError', async () => {
  const { nonce, ciphertext } = await encrypt(makeKey(), new TextEncoder().encode('secret'));
  await expect(decrypt(makeKey(), nonce, ciphertext)).rejects.toThrow(DecryptionFailedError);
});

test('rejects a wrong-length key with the same error, not a raw WebCrypto exception', async () => {
  const { nonce, ciphertext } = await encrypt(makeKey(), new TextEncoder().encode('secret'));
  const wrongLengthKey = crypto.getRandomValues(new Uint8Array(16));
  await expect(decrypt(wrongLengthKey, nonce, ciphertext)).rejects.toThrow(DecryptionFailedError);
});

test('rejects corrupted ciphertext with the same error as a wrong key', async () => {
  const key = makeKey();
  const { nonce, ciphertext } = await encrypt(key, new TextEncoder().encode('secret'));
  const corrupted = new Uint8Array(ciphertext);
  corrupted[0] ^= 0xff;

  await expect(decrypt(key, nonce, corrupted)).rejects.toThrow(DecryptionFailedError);
});

test('the wrong-key and corrupted-file failures are the same error, not distinguishable', async () => {
  const key = makeKey();
  const { nonce, ciphertext } = await encrypt(key, new TextEncoder().encode('secret'));
  const corrupted = new Uint8Array(ciphertext);
  corrupted[0] ^= 0xff;

  const wrongKeyError = await decrypt(makeKey(), nonce, ciphertext).catch((e) => e);
  const corruptedError = await decrypt(key, nonce, corrupted).catch((e) => e);

  expect(wrongKeyError).toBeInstanceOf(DecryptionFailedError);
  expect(corruptedError).toBeInstanceOf(DecryptionFailedError);
  expect(wrongKeyError.message).toBe(corruptedError.message);
});

test('round-trips plaintext through seal then open', async () => {
  const key = makeKey();
  const plaintext = new TextEncoder().encode('a sealed byte string');
  const sealed = await seal(key, plaintext);
  expect(new TextDecoder().decode(await open(key, sealed))).toBe('a sealed byte string');
});

test('seal lays out nonce then ciphertext, the same framing every store used to hand-build', async () => {
  const key = makeKey();
  const plaintext = new TextEncoder().encode('framing stays put');
  const sealed = await seal(key, plaintext);
  // What every store used to assemble itself: encrypt(), then nonce||ciphertext.
  const { nonce, ciphertext } = await encrypt(key, plaintext);
  expect(sealed.length).toBe(nonce.length + ciphertext.length);
  expect(sealed.length - plaintext.length).toBe(SEAL_OVERHEAD);
});

test('open reads a byte string built the old way: encrypt(), then nonce concatenated with ciphertext by hand', async () => {
  const key = makeKey();
  const plaintext = new TextEncoder().encode('written before seal/open existed');
  const { nonce, ciphertext } = await encrypt(key, plaintext);
  const handBuilt = new Uint8Array(nonce.length + ciphertext.length);
  handBuilt.set(nonce);
  handBuilt.set(ciphertext, nonce.length);

  expect(new TextDecoder().decode(await open(key, handBuilt))).toBe('written before seal/open existed');
});

test('seal/open carry additional data the same as encrypt/decrypt', async () => {
  const key = makeKey();
  const aad = new TextEncoder().encode('bound-to');
  const sealed = await seal(key, new TextEncoder().encode('payload'), aad);
  await expect(open(key, sealed)).rejects.toThrow(DecryptionFailedError);
  expect(new TextDecoder().decode(await open(key, sealed, aad))).toBe('payload');
});

test('never logs key material', async () => {
  const key = makeKey();
  const keyHex = Buffer.from(key).toString('hex');

  const output = await capturedConsoleOutput(async () => {
    const { nonce, ciphertext } = await encrypt(key, new TextEncoder().encode('secret'));
    await decrypt(key, nonce, ciphertext);
  });

  for (const text of output) {
    expect(text.includes(keyHex)).toBe(false);
  }
});
