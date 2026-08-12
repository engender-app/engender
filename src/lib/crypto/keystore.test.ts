import { test, expect } from 'vitest';
import { createKeystore, unlockKeystore, rewrapKeystore, parseKeystore, serializeKeystore } from './keystore.ts';
import { DecryptionFailedError } from './aesGcm.ts';
import { JOURNAL_ARGON2_PARAMS, type Argon2Params } from './params.ts';

/* The Node tier can afford one real Argon2id derivation per test at the
   journal parameters (~60ms here), and stubbing the KDF would un-test the
   one property the keystore exists for: that only the passphrase reaches
   the data key. */

test('creating a keystore yields a 32-byte data key and unlocking returns the same key', async () => {
  const { metadata, dataKey } = await createKeystore('correct horse battery staple');
  expect(dataKey.length).toBe(32);

  const unlocked = await unlockKeystore(metadata, 'correct horse battery staple');
  expect(unlocked).toEqual(dataKey);
});

test('two keystores never share a data key or a salt, even for the same passphrase', async () => {
  const a = await createKeystore('same passphrase');
  const b = await createKeystore('same passphrase');
  expect(a.dataKey).not.toEqual(b.dataKey);
  expect(a.metadata.salt).not.toEqual(b.metadata.salt);
});

test('a wrong passphrase fails as DecryptionFailedError, indistinguishable from corruption', async () => {
  const { metadata } = await createKeystore('the real one');
  await expect(unlockKeystore(metadata, 'a guess')).rejects.toThrow(DecryptionFailedError);
});

test('the metadata holds no usable key: every field survives disclosure except through the KDF', async () => {
  const { metadata, dataKey } = await createKeystore('passphrase');
  const disclosed = serializeKeystore(metadata);
  const keyHex = Buffer.from(dataKey).toString('hex');
  const keyBase64 = Buffer.from(dataKey).toString('base64');
  expect(disclosed.includes(keyHex)).toBe(false);
  expect(disclosed.includes(keyBase64)).toBe(false);
});

test('rewrapping changes the passphrase without changing the data key', async () => {
  const { metadata, dataKey } = await createKeystore('old passphrase');
  const rewrapped = await rewrapKeystore(metadata, 'old passphrase', 'new passphrase');

  expect(await unlockKeystore(rewrapped, 'new passphrase')).toEqual(dataKey);
  await expect(unlockKeystore(rewrapped, 'old passphrase')).rejects.toThrow(DecryptionFailedError);
});

test('rewrapping with a wrong current passphrase fails and leaves nothing changed', async () => {
  const { metadata } = await createKeystore('the real one');
  await expect(rewrapKeystore(metadata, 'a guess', 'new one')).rejects.toThrow(DecryptionFailedError);
});

test('rewrap salts freshly rather than reusing the old salt', async () => {
  const { metadata } = await createKeystore('old passphrase');
  const rewrapped = await rewrapKeystore(metadata, 'old passphrase', 'new passphrase');
  expect(rewrapped.salt).not.toEqual(metadata.salt);
});

test('metadata round-trips through its serialized form', async () => {
  const { metadata, dataKey } = await createKeystore('passphrase');
  const parsed = parseKeystore(serializeKeystore(metadata));
  expect(await unlockKeystore(parsed, 'passphrase')).toEqual(dataKey);
});

test('unlock derives with the parameters the metadata carries, not the constants of this build', async () => {
  /* The evolvability ADR-0013 asks for: a keystore written under older (or
     re-tuned) parameters must keep unlocking after params.ts changes. A
     cheap parameter set stands in for "a different build's constants". */
  const cheap: Argon2Params = { memorySize: 1024, iterations: 1, parallelism: 1, hashLength: 32 };
  const { metadata, dataKey } = await createKeystore('passphrase', cheap);
  expect(metadata.params).toEqual(cheap);
  expect(metadata.params).not.toEqual(JOURNAL_ARGON2_PARAMS);
  expect(await unlockKeystore(metadata, 'passphrase')).toEqual(dataKey);
});

test('parsing a keystore from a newer format version refuses rather than misreads', async () => {
  const { metadata } = await createKeystore('passphrase');
  const newer = serializeKeystore(metadata).replace('"version":1', '"version":2');
  expect(() => parseKeystore(newer)).toThrow(/version/);
});

test('a mangled KDF parameter block is refused by name, not surfaced as a wrong passphrase', async () => {
  const { metadata } = await createKeystore('passphrase');
  const parsed = JSON.parse(serializeKeystore(metadata)) as { params: unknown };
  parsed.params = { memorySize: 'lots' };
  expect(() => parseKeystore(JSON.stringify(parsed))).toThrow(/parameters/);
});
