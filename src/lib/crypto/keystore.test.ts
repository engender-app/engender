import { test, expect } from 'vitest';
import { createKeystore, unlockKeystore, rewrapKeystore, parseKeystore, serializeKeystore, wrapDataKeyWithSecret, KeystoreUnreadableError } from './keystore.ts';
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

test('wrapping an existing data key under a passphrase unlocks back to the same bytes', async () => {
  const dataKey = crypto.getRandomValues(new Uint8Array(32));
  const metadata = await wrapDataKeyWithSecret(dataKey, 'portable secret');

  expect(await unlockKeystore(metadata, 'portable secret')).toEqual(dataKey);
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
  // One past what this build writes. Version 1 is a readable format now
  // (ticket 53), so the refusal has to be tested above the current one.
  const newer = serializeKeystore(metadata).replace('"version":2', '"version":3');
  expect(() => parseKeystore(newer)).toThrow(/version/);
});

test('a mangled KDF parameter block is refused by name, not surfaced as a wrong passphrase', async () => {
  const { metadata } = await createKeystore('passphrase');
  const parsed = JSON.parse(serializeKeystore(metadata)) as { params: unknown };
  parsed.params = { memorySize: 'lots' };
  expect(() => parseKeystore(JSON.stringify(parsed))).toThrow(/parameters/);
});

/* --- the secret source (ticket 53, ADR-0041) --------------------------- */

/* Cheap params where the test is about the record rather than about the
   cost: the real pin-encryption profile is 64 MiB over 4 passes, and
   proving that a field round-trips does not need 150ms of it. */
const CHEAP: Argon2Params = { memorySize: 1024, iterations: 1, parallelism: 1, hashLength: 32 };

test('a keystore records which kind of secret wrapped it', async () => {
  const passphrase = await createKeystore('a typed passphrase', CHEAP);
  const pin = await createKeystore('1234', CHEAP, 'pin');

  expect(passphrase.metadata.secretSource).toBe('passphrase');
  expect(pin.metadata.secretSource).toBe('pin');
});

test('the secret source survives serialization, so boot can pick a gate before unlocking', async () => {
  const { metadata } = await createKeystore('1234', CHEAP, 'pin');
  const reparsed = parseKeystore(serializeKeystore({ ...metadata, pinBinding: 'browser' }));

  expect(reparsed.secretSource).toBe('pin');
  expect(reparsed.params).toEqual(CHEAP);
});

test('a keystore written before the source existed reads as a passphrase one', async () => {
  /* Exactly what a shipped build wrote: version 1, no secretSource field.
     Rejecting it would lock every existing installation out of its journal,
     so the absent field means the only thing it could have meant. */
  const { metadata, dataKey } = await createKeystore('the original passphrase', CHEAP);
  const v1 = JSON.parse(serializeKeystore(metadata)) as Record<string, unknown>;
  v1.version = 1;
  delete v1.secretSource;

  const reparsed = parseKeystore(JSON.stringify(v1));
  expect(reparsed.secretSource).toBe('passphrase');
  expect(await unlockKeystore(reparsed, 'the original passphrase')).toEqual(dataKey);
});

test('a keystore from a format this build does not read fails by name, not as a wrong secret', async () => {
  const { metadata } = await createKeystore('passphrase', CHEAP);
  const future = JSON.parse(serializeKeystore(metadata)) as Record<string, unknown>;
  future.version = 99;

  expect(() => parseKeystore(JSON.stringify(future))).toThrow(KeystoreUnreadableError);
});

test('an unrecognised secret source fails by name rather than unlocking under the wrong profile', async () => {
  const { metadata } = await createKeystore('passphrase', CHEAP);
  const odd = JSON.parse(serializeKeystore(metadata)) as Record<string, unknown>;
  odd.secretSource = 'retina';

  expect(() => parseKeystore(JSON.stringify(odd))).toThrow(KeystoreUnreadableError);
});

test('changing access mode rewraps the same data key under a different kind of secret', async () => {
  const { metadata, dataKey } = await createKeystore('a typed passphrase', CHEAP);
  const toPin = await rewrapKeystore(metadata, 'a typed passphrase', '1234', CHEAP, 'pin');

  expect(toPin.secretSource).toBe('pin');
  expect(await unlockKeystore(toPin, '1234')).toEqual(dataKey);
  await expect(unlockKeystore(toPin, 'a typed passphrase')).rejects.toThrow(DecryptionFailedError);
});

test('rewrapping without naming a source keeps the one it already had', async () => {
  const { metadata } = await createKeystore('1234', CHEAP, 'pin');
  const rewrapped = await rewrapKeystore(metadata, '1234', '5678', CHEAP);

  expect(rewrapped.secretSource).toBe('pin');
});

/* --- which key the PIN was bound to (ticket sec-02-06) ------------------- */

test('a PIN keystore carries its binding through serialization, so a later unlock uses the key that wrapped it', async () => {
  const { metadata } = await createKeystore('1234', CHEAP, 'pin');
  const reparsed = parseKeystore(serializeKeystore({ ...metadata, pinBinding: 'keystore' }));

  expect(reparsed.pinBinding).toBe('keystore');
});

/* Every PIN journal made before the Android binding existed. Reading the
   absent field as anything but the browser key would derive the secret from
   a key that never wrapped the file, and arrive at the gate as a wrong PIN
   on a correct one. */
test('a PIN keystore written before the field existed reads as bound to the browser key', async () => {
  const { metadata, dataKey } = await createKeystore('1234', CHEAP, 'pin');
  const before = JSON.parse(serializeKeystore({ ...metadata, pinBinding: 'browser' })) as Record<string, unknown>;
  delete before.pinBinding;

  const reparsed = parseKeystore(JSON.stringify(before));
  expect(reparsed.pinBinding).toBe('browser');
  expect(await unlockKeystore(reparsed, '1234')).toEqual(dataKey);
});

test('a binding this build does not know fails by name rather than falling back to the browser key', async () => {
  const { metadata } = await createKeystore('1234', CHEAP, 'pin');
  const odd = JSON.parse(serializeKeystore({ ...metadata, pinBinding: 'browser' })) as Record<string, unknown>;
  odd.pinBinding = 'strongbox';

  expect(() => parseKeystore(JSON.stringify(odd))).toThrow(KeystoreUnreadableError);
});

/* The forgotten-attach case, refused where it can still be fixed. A PIN
   keystore on disk with no binding named is one the next boot has to guess
   about, and the wrong guess is a journal that will not open. */
test('a PIN keystore that names no binding is refused rather than written', async () => {
  const { metadata } = await createKeystore('1234', CHEAP, 'pin');

  expect(() => serializeKeystore(metadata)).toThrow(KeystoreUnreadableError);
});

test('a keystore that is not a PIN one neither needs nor gains a binding', async () => {
  const { metadata } = await createKeystore('a typed passphrase', CHEAP);
  const reparsed = parseKeystore(serializeKeystore(metadata));

  expect(reparsed.pinBinding).toBeUndefined();
});
