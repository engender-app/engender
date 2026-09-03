import { test, expect } from 'vitest';
import {
  RecoveryKeyAbsentError,
  inMemoryRecoveryKeyPorts,
  mintRecoveryKey,
  openWithRecoveryKey,
  recoveryKeyExists,
  revokeRecoveryKey
} from './recovery-key.ts';
import {
  RecoveryWrapUnreadableError,
  parseRecoveryWrap,
  serializeRecoveryWrap,
  wrapDataKeyWithRecoveryKey
} from '../crypto/recoveryWrap.ts';
import { RecoveryKeyMistypedError, canonicalRecoveryKey, generateRecoveryKey } from '../crypto/recoveryKey.ts';
import { DecryptionFailedError } from '../crypto/aesGcm.ts';
import { createKeystore, rewrapKeystore, unlockKeystore } from '../crypto/keystore.ts';

const aDataKey = (): Uint8Array<ArrayBuffer> => crypto.getRandomValues(new Uint8Array(32));

test('a minted key opens the journal back to the same data key', async () => {
  const ports = inMemoryRecoveryKeyPorts();
  const dataKey = aDataKey();

  const written = await mintRecoveryKey(dataKey, ports);
  expect(await openWithRecoveryKey(written, ports)).toEqual(dataKey);
});

test('the key it hands back is the written form, and reads back typed loosely', async () => {
  const ports = inMemoryRecoveryKeyPorts();
  const dataKey = aDataKey();

  const written = await mintRecoveryKey(dataKey, ports);
  expect(written).toMatch(/^[0-9A-Z]{5}(-[0-9A-Z]{5}){4}$/);
  expect(await openWithRecoveryKey(written.toLowerCase().replace(/-/g, ' '), ports)).toEqual(dataKey);
});

test('a well-formed key that is not this journal fails as a wrong key', async () => {
  const ports = inMemoryRecoveryKeyPorts();
  await mintRecoveryKey(aDataKey(), ports);

  await expect(openWithRecoveryKey(generateRecoveryKey(), ports)).rejects.toThrow(DecryptionFailedError);
});

/* The three failures are three because they are three different sentences
   at the gate, and a screen that collapsed them would send somebody after
   paper they either already hold or never had. */
test('a mistyped key fails as a typo rather than as a wrong key', async () => {
  const ports = inMemoryRecoveryKeyPorts();
  const written = await mintRecoveryKey(aDataKey(), ports);

  await expect(openWithRecoveryKey(written.slice(0, -1), ports)).rejects.toThrow(RecoveryKeyMistypedError);
});

test('a journal with no recovery key says so, rather than calling the key wrong', async () => {
  const ports = inMemoryRecoveryKeyPorts();
  await expect(openWithRecoveryKey(generateRecoveryKey(), ports)).rejects.toThrow(RecoveryKeyAbsentError);
});

test('a mistyped key is refused before the stored wrap is even read', async () => {
  let reads = 0;
  const ports = inMemoryRecoveryKeyPorts();
  const counting = { ...ports, read: async () => (reads++, ports.read()) };

  await expect(openWithRecoveryKey('nonsense', counting)).rejects.toThrow(RecoveryKeyMistypedError);
  expect(reads).toBe(0);
});

test('minting again replaces the key: the old one stops working, the journal does not change', async () => {
  const ports = inMemoryRecoveryKeyPorts();
  const dataKey = aDataKey();

  const first = await mintRecoveryKey(dataKey, ports);
  const second = await mintRecoveryKey(dataKey, ports);
  expect(second).not.toBe(first);

  expect(await openWithRecoveryKey(second, ports)).toEqual(dataKey);
  await expect(openWithRecoveryKey(first, ports)).rejects.toThrow(DecryptionFailedError);
});

test('existence is answerable before anything is typed, and revoking is idempotent', async () => {
  const ports = inMemoryRecoveryKeyPorts();
  expect(await recoveryKeyExists(ports)).toBe(false);

  await mintRecoveryKey(aDataKey(), ports);
  expect(await recoveryKeyExists(ports)).toBe(true);

  await revokeRecoveryKey(ports);
  expect(await recoveryKeyExists(ports)).toBe(false);
  await revokeRecoveryKey(ports);
  expect(await recoveryKeyExists(ports)).toBe(false);
});

test('a revoked key stops opening the journal', async () => {
  const ports = inMemoryRecoveryKeyPorts();
  const written = await mintRecoveryKey(aDataKey(), ports);

  await revokeRecoveryKey(ports);
  await expect(openWithRecoveryKey(written, ports)).rejects.toThrow(RecoveryKeyAbsentError);
});

/* ADR-0054's claim that a recovery key survives every access-mode change,
   proven rather than asserted: a mode change rewraps the same data key, so
   there is nothing for the recovery wrap to fall out of step with. */
test('a recovery key still opens the journal after the access mode changes', async () => {
  const ports = inMemoryRecoveryKeyPorts();
  const { metadata, dataKey } = await createKeystore('the old passphrase');
  const written = await mintRecoveryKey(dataKey, ports);

  const toPin = await rewrapKeystore(metadata, 'the old passphrase', '4321', undefined, 'pin');
  expect(await unlockKeystore(toPin, '4321')).toEqual(dataKey);
  /* Asserted after each direction rather than once at the end: a rewrap
     that broke the recovery wrap on the way out and mended it on the way
     back would pass a single check at the finish. */
  expect(await openWithRecoveryKey(written, ports)).toEqual(dataKey);

  const backToPassphrase = await rewrapKeystore(toPin, '4321', 'a new passphrase', undefined, 'passphrase');
  expect(await unlockKeystore(backToPassphrase, 'a new passphrase')).toEqual(dataKey);
  expect(await openWithRecoveryKey(written, ports)).toEqual(dataKey);
});

/* Every access mode, because the ticket asks for every access mode and the
   reason it holds is worth pinning: the recovery wrap seals the data key
   and never touches the keystore, so what opened the journal first cannot
   matter. Three of the four are keystore sources and are built here for
   real; device-bound mode has no keystore at all - its key is minted by the
   platform and wrapped elsewhere (data/device-bound-journal.ts) - so it is
   represented by the thing it hands back, which is 32 random bytes and
   nothing else. */
test('a minted key opens the journal whichever access mode the journal is on', async () => {
  const fromKeystore = await Promise.all(
    (['passphrase', 'pin', 'biometric'] as const).map(async (source) => {
      const { dataKey } = await createKeystore('a secret for this mode', undefined, source);
      return dataKey;
    })
  );
  const deviceBound = aDataKey();

  for (const dataKey of [...fromKeystore, deviceBound]) {
    const ports = inMemoryRecoveryKeyPorts();
    const written = await mintRecoveryKey(dataKey, ports);
    expect(await openWithRecoveryKey(written, ports)).toEqual(dataKey);
  }
});

test('the stored wrap holds no usable key: it survives disclosure without the written key', async () => {
  const dataKey = aDataKey();
  const written = generateRecoveryKey();
  const wrap = await wrapDataKeyWithRecoveryKey(dataKey, canonicalRecoveryKey(written));

  const disclosed = serializeRecoveryWrap(wrap);
  expect(disclosed.includes(Buffer.from(dataKey).toString('base64'))).toBe(false);
  expect(disclosed.includes(Buffer.from(dataKey).toString('hex'))).toBe(false);
  expect(disclosed.includes(written)).toBe(false);
  expect(disclosed.includes(canonicalRecoveryKey(written))).toBe(false);
});

test('the persisted form round-trips through the file the app writes', async () => {
  const dataKey = aDataKey();
  const written = generateRecoveryKey();
  const wrap = await wrapDataKeyWithRecoveryKey(dataKey, canonicalRecoveryKey(written));

  const reparsed = parseRecoveryWrap(serializeRecoveryWrap(wrap));
  expect(reparsed).toEqual(wrap);
});

test('a recovery file this build cannot read fails by name, never as a wrong key', () => {
  expect(() => parseRecoveryWrap('not json at all')).toThrow(RecoveryWrapUnreadableError);
  expect(() => parseRecoveryWrap(JSON.stringify({ version: 2 }))).toThrow(/version 2/);
  expect(() => parseRecoveryWrap(JSON.stringify({ version: 1, kdf: 'argon2id' }))).toThrow(/missing fields/);
  expect(() =>
    parseRecoveryWrap(
      JSON.stringify({ version: 1, kdf: 'argon2id', salt: 'AA', nonce: 'AA', wrappedKey: 'AA', params: { iterations: 2 } })
    )
  ).toThrow(/no usable KDF parameters/);
});

/* Nothing a person can do about an unreadable file, and the one useful
   thing the screen can offer is a fresh key - which overwrites it. So the
   read that decides whether to offer that treats it as no key rather than
   propagating an error into a screen with no action on it. */
test('an unreadable recovery file reads as no recovery key', async () => {
  const ports = inMemoryRecoveryKeyPorts();
  const broken = { ...ports, read: async () => { throw new RecoveryWrapUnreadableError('mangled'); } };

  expect(await recoveryKeyExists(broken)).toBe(false);
});
