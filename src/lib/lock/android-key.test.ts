/* The Android key flow, tested where it can actually go wrong (ticket 13).

   The module under test is the one that turns "what the Keystore and the
   biometric prompt said" into "does the journal open". Every test here is
   written from the ticket's warning: a bug in this file must not be able to
   produce a data key, and must not be able to produce nothing at all.

   The bridge is a fake object rather than the real plugin, because what is
   interesting is the answers, not the transport. The Keystore itself is
   asserted on a device (JournalKeystoreTest). */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { confirmWithBiometrics, openAndroidDataKey, type KeystoreBridge } from './android-key.ts';

const HEX = '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f';
const COPY = { title: 'Unlock', subtitle: 'Your Journal', cancel: 'Use PIN', deviceCredential: false };

/** A bridge whose answers each test writes; anything not written throws, so
    a flow that calls the wrong method fails loudly rather than quietly. */
function bridge(answers: Partial<KeystoreBridge>): KeystoreBridge {
  const missing = (name: string) => () => Promise.reject(new Error(`the flow called ${name}`));
  return {
    status: answers.status ?? (missing('status') as KeystoreBridge['status']),
    create: answers.create ?? (missing('create') as KeystoreBridge['create']),
    unlock: answers.unlock ?? (missing('unlock') as KeystoreBridge['unlock']),
    confirm: answers.confirm ?? (missing('confirm') as KeystoreBridge['confirm']),
    erase: answers.erase ?? (missing('erase') as KeystoreBridge['erase'])
  };
}

test('a first run mints a key without asking anyone to authenticate', async () => {
  const result = await openAndroidDataKey(
    bridge({
      status: async () => ({ hasKey: false }),
      create: async () => ({ outcome: 'created', hexKey: HEX })
    }),
    COPY
  );

  assert.equal(result.kind, 'key');
  assert.equal(result.kind === 'key' && result.dataKey.length, 32);
  assert.equal(result.kind === 'key' && result.dataKey[0], 0x00);
  assert.equal(result.kind === 'key' && result.dataKey[31], 0x1f);
});

test('a later run unwraps behind the prompt, and the request goes to the prompt', async () => {
  let shown: unknown = null;
  const result = await openAndroidDataKey(
    bridge({
      status: async () => ({ hasKey: true }),
      unlock: async (request) => {
        shown = request;
        return { outcome: 'authenticated', hexKey: HEX };
      }
    }),
    COPY
  );

  assert.equal(result.kind, 'key');
  // The prompt is Android's own UI, so its words have to travel from the
  // catalogue rather than being written in Java - and so does the choice
  // between a finger and the device's own credential.
  assert.deepEqual(shown, COPY);
});

test('the device-credential way forward reaches the prompt as itself', async () => {
  // What the screen does when the sensor is unavailable or unenrolled. If
  // this flag were dropped the app would ask for a finger again, on a device
  // that has already said it has none, for ever.
  let asked: unknown = null;
  await openAndroidDataKey(
    bridge({
      status: async () => ({ hasKey: true }),
      unlock: async (request) => {
        asked = request.deviceCredential;
        return { outcome: 'authenticated', hexKey: HEX };
      }
    }),
    { ...COPY, deviceCredential: true }
  );

  assert.equal(asked, true);
});

test('every biometric refusal comes back as a refusal with something to do', async () => {
  for (const outcome of ['unavailable', 'unenrolled', 'cancelled', 'failed', 'lockedOut', 'noDeviceCredential']) {
    const result = await openAndroidDataKey(
      bridge({ status: async () => ({ hasKey: true }), unlock: async () => ({ outcome }) }),
      COPY
    );

    assert.equal(result.kind, 'refused', `${outcome} should refuse`);
    if (result.kind !== 'refused') continue;
    assert.equal(result.authentication.outcome, outcome);
    assert.equal(result.authentication.unlocksJournal, false);
    assert.ok(result.authentication.wayForward, `${outcome} left nothing to do`);
  }
});

test('a success with no key is a refusal, not an unlocked journal', async () => {
  // The shape a bridge bug would take: the prompt succeeded, the unwrap
  // did not, and the plugin answered with only half of it. Reading
  // `outcome` alone here would open the journal with no key.
  for (const half of [{ outcome: 'authenticated' }, { outcome: 'authenticated', hexKey: '' }]) {
    const result = await openAndroidDataKey(
      bridge({ status: async () => ({ hasKey: true }), unlock: async () => half }),
      COPY
    );
    assert.equal(result.kind, 'refused', `${JSON.stringify(half)} must not unlock the Journal`);
  }
});

test('a key that is not 32 bytes is refused rather than handed to SQLCipher', async () => {
  // SQLCipher takes 64 hex characters and nothing else (ADR-0018's key is 32
  // bytes). A short or mistyped key would otherwise reach the driver and come
  // back as "file is not a database", which reads like a corrupt Journal.
  for (const hex of ['00', HEX + '00', 'zz'.repeat(32), HEX.slice(0, 63) + 'g']) {
    const result = await openAndroidDataKey(
      bridge({
        status: async () => ({ hasKey: true }),
        unlock: async () => ({ outcome: 'authenticated', hexKey: hex })
      }),
      COPY
    );
    assert.equal(result.kind, 'refused', `"${hex.slice(0, 8)}..." must not be taken as a key`);
  }
});

test('an unrecognised outcome refuses, the way the interpreter does', async () => {
  const result = await openAndroidDataKey(
    bridge({ status: async () => ({ hasKey: true }), unlock: async () => ({ outcome: 'ERROR_NONE', hexKey: HEX }) }),
    COPY
  );

  assert.equal(result.kind, 'refused');
  assert.equal(result.kind === 'refused' && result.authentication.outcome, 'failed');
});

test('a key the platform threw away is its own state, not a failed finger', async () => {
  /* Removing the screen lock destroys a Keystore key bound to it, and no
     amount of retrying brings it back. Reported as a biometric failure it
     would send someone round the prompt for ever - the trap the ticket's
     third box names. */
  const result = await openAndroidDataKey(
    bridge({ status: async () => ({ hasKey: true }), unlock: async () => ({ outcome: 'keyInvalidated' }) }),
    COPY
  );

  assert.equal(result.kind, 'invalidated');
});

test('the app-lock prompt asks for no key, and only a success unlocks', async () => {
  /* Mid-session the data key is already in memory, so this path never
     touches the Keystore - which is exactly why it must not be able to
     unlock on anything but an explicit success. */
  const unlocked = await confirmWithBiometrics(
    bridge({ confirm: async () => ({ outcome: 'authenticated' }) }),
    COPY
  );
  assert.equal(unlocked.unlocksJournal, true);

  for (const outcome of ['cancelled', 'failed', 'unenrolled', 'unavailable', 'lockedOut', 'nonsense']) {
    const refused = await confirmWithBiometrics(bridge({ confirm: async () => ({ outcome }) }), COPY);
    assert.equal(refused.unlocksJournal, false, `${outcome} must not unlock the app`);
    assert.ok(refused.wayForward, `${outcome} left nothing to do`);
  }
});

test('a device with no lock screen cannot be given a key, and is told so', async () => {
  const result = await openAndroidDataKey(
    bridge({ status: async () => ({ hasKey: false }), create: async () => ({ outcome: 'noDeviceCredential' }) }),
    COPY
  );

  assert.equal(result.kind, 'refused');
  assert.equal(result.kind === 'refused' && result.authentication.wayForward, 'setDeviceLock');
});
