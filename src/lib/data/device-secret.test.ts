import { test, expect } from 'vitest';
import {
  DeviceBindingUnavailableError,
  combinePinWithDevice,
  createDeviceBindingSecret,
  readDeviceBindingSecret,
  removeDeviceBindingSecret
} from './device-secret.ts';
import type { DeviceKeySlot } from './device-bound-journal.ts';

/* An in-memory stand-in for the IndexedDB slot. The key inside it is a real
   non-extractable CryptoKey, because "non-extractable" is the property the
   whole scheme rests on and a plain object would un-test it. */
function fakeSlot(): DeviceKeySlot & { cleared(): void } {
  let held: CryptoKey | null = null;
  return {
    load: async () => held,
    save: async (key) => {
      held = key;
    },
    remove: async () => {
      held = null;
    },
    cleared: () => {
      held = null;
    }
  };
}

test('the device secret is stable across reads, so the same PIN keeps opening the journal', async () => {
  const slot = fakeSlot();
  const minted = await createDeviceBindingSecret(slot);

  expect(await readDeviceBindingSecret(slot)).toBe(minted);
  expect(await readDeviceBindingSecret(slot)).toBe(minted);
});

test('two devices never derive the same secret, so a copied keystore is useless off its device', async () => {
  const a = await createDeviceBindingSecret(fakeSlot());
  const b = await createDeviceBindingSecret(fakeSlot());

  expect(a).not.toBe(b);
});

test('the key never leaves the slot: what is stored refuses to be exported', async () => {
  const slot = fakeSlot();
  await createDeviceBindingSecret(slot);
  const key = await slot.load();

  expect(key).not.toBeNull();
  expect(key!.extractable).toBe(false);
  await expect(crypto.subtle.exportKey('raw', key!)).rejects.toThrow();
});

/* The failure that must not be dressed up as a wrong PIN. A cleared browser
   profile or an evicted origin means the journal cannot be opened by anyone,
   including its owner - telling somebody their PIN was wrong would have them
   retyping a correct PIN for ever. */
test('a missing device key is its own failure, not a wrong-PIN failure', async () => {
  const slot = fakeSlot();
  await createDeviceBindingSecret(slot);
  slot.cleared();

  await expect(readDeviceBindingSecret(slot)).rejects.toThrow(DeviceBindingUnavailableError);
});

test('reading never mints: an absent key stays absent rather than becoming a fresh wrong one', async () => {
  const slot = fakeSlot();

  await expect(readDeviceBindingSecret(slot)).rejects.toThrow(DeviceBindingUnavailableError);
  expect(await slot.load()).toBeNull();
});

test('removing the secret takes the key with it', async () => {
  const slot = fakeSlot();
  await createDeviceBindingSecret(slot);
  await removeDeviceBindingSecret(slot);

  expect(await slot.load()).toBeNull();
});

test('the PIN and the device secret combine unambiguously', async () => {
  const secret = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';

  // No pair of (pin, secret) may collide with another by running together.
  expect(combinePinWithDevice('12', '34' + secret)).not.toBe(combinePinWithDevice('1234', secret));
  expect(combinePinWithDevice('1234', secret)).toBe(combinePinWithDevice('1234', secret));
  expect(combinePinWithDevice('1234', secret)).toContain('1234');
});
