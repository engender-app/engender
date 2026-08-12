import { test, expect } from 'vitest';
import { encryptedFileStore } from './encrypted-file-store.ts';
import { fakeFileStore } from './test-support/fake-file-store.ts';
import { DecryptionFailedError } from '../../crypto/aesGcm.ts';

const makeKey = () => crypto.getRandomValues(new Uint8Array(32));

/* A recognizable plaintext: JPEG magic followed by text, so the
   no-plaintext-on-disk assertions can look for both the signature and the
   content, the same two things the claim gate scans for. */
const photoBytes = () =>
  new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...new TextEncoder().encode('sentinel-photo-body-4413')]);

test('round-trips bytes through write then read', async () => {
  const store = encryptedFileStore(fakeFileStore(), makeKey());
  await store.write('a.jpg', photoBytes());
  expect(await store.read('a.jpg')).toEqual(photoBytes());
});

test('what lands on the inner store is ciphertext: no JPEG magic, no plaintext body', async () => {
  const inner = fakeFileStore();
  const store = encryptedFileStore(inner, makeKey());
  await store.write('a.jpg', photoBytes());

  const stored = await inner.read('a.jpg');
  expect(stored).not.toBeNull();
  expect([...stored!.slice(0, 4)]).not.toEqual([0xff, 0xd8, 0xff, 0xe0]);
  const asText = new TextDecoder('latin1').decode(stored!);
  expect(asText.includes('sentinel-photo-body-4413')).toBe(false);
});

test('size() answers with the plaintext length packing needs, not the file length', async () => {
  const store = encryptedFileStore(fakeFileStore(), makeKey());
  await store.write('a.jpg', photoBytes());
  expect(await store.size('a.jpg')).toBe(photoBytes().length);
});

test('a missing file is null from read and size, same as the store underneath', async () => {
  const store = encryptedFileStore(fakeFileStore(), makeKey());
  expect(await store.read('missing.jpg')).toBeNull();
  expect(await store.size('missing.jpg')).toBeNull();
});

test('remove and list pass through, so the orphan sweep sees the same names', async () => {
  const inner = fakeFileStore();
  const store = encryptedFileStore(inner, makeKey());
  await store.write('a.jpg', photoBytes());
  await store.write('b.jpg', photoBytes());
  expect((await store.list()).sort()).toEqual(['a.jpg', 'b.jpg']);

  await store.remove('a.jpg');
  expect(await store.list()).toEqual(['b.jpg']);
  expect(inner.names()).toEqual(['b.jpg']);
});

test('a tampered file fails as DecryptionFailedError rather than decoding garbage', async () => {
  const inner = fakeFileStore();
  const store = encryptedFileStore(inner, makeKey());
  await store.write('a.jpg', photoBytes());

  const stored = await inner.read('a.jpg');
  const corrupted = new Uint8Array(stored!);
  corrupted[corrupted.length - 1] ^= 0xff;
  await inner.write('a.jpg', corrupted);

  await expect(store.read('a.jpg')).rejects.toThrow(DecryptionFailedError);
});

test('a file cannot be swapped in under another name: the name is authenticated', async () => {
  const inner = fakeFileStore();
  const store = encryptedFileStore(inner, makeKey());
  await store.write('full.jpg', photoBytes());

  await inner.write('thumb.jpg', (await inner.read('full.jpg'))!);
  await expect(store.read('thumb.jpg')).rejects.toThrow(DecryptionFailedError);
});

test('the wrong key reads nothing', async () => {
  const inner = fakeFileStore();
  await encryptedFileStore(inner, makeKey()).write('a.jpg', photoBytes());
  await expect(encryptedFileStore(inner, makeKey()).read('a.jpg')).rejects.toThrow(DecryptionFailedError);
});
