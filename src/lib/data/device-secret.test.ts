import { test, expect } from 'vitest';
import {
  DeviceBindingUnavailableError,
  browserDeviceBinding,
  combinePinWithDevice,
  keystoreDeviceBinding,
  type PinBindingBridge
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

/* The phone's side of the bridge, with the one property that matters kept
   real: a signature that is a function of the key under the alias and of the
   label, so replacing the key changes the secret and reading a missing alias
   yields nothing. What the real plugin does with Android Keystore is a
   property of the platform, asserted on a device in PinBindingKeystoreTest. */
function fakeBridge(): PinBindingBridge & { erased(): boolean } {
  let key: string | null = null;
  let erased = false;
  return {
    create: async ({ label }) => {
      key = crypto.randomUUID();
      return { secret: `${key}/${label}` };
    },
    read: async ({ label }) => ({ secret: key === null ? null : `${key}/${label}` }),
    erase: async () => {
      key = null;
      erased = true;
    },
    erased: () => erased
  };
}

test('the device secret is stable across reads, so the same PIN keeps opening the journal', async () => {
  const binding = browserDeviceBinding(fakeSlot());
  const minted = await binding.create();

  expect(await binding.read()).toBe(minted);
  expect(await binding.read()).toBe(minted);
});

test('two devices never derive the same secret, so a copied keystore is useless off its device', async () => {
  const a = await browserDeviceBinding(fakeSlot()).create();
  const b = await browserDeviceBinding(fakeSlot()).create();

  expect(a).not.toBe(b);
});

test('the key never leaves the slot: what is stored refuses to be exported', async () => {
  const slot = fakeSlot();
  await browserDeviceBinding(slot).create();
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
  await browserDeviceBinding(slot).create();
  slot.cleared();

  await expect(browserDeviceBinding(slot).read()).rejects.toThrow(DeviceBindingUnavailableError);
});

test('reading never mints: an absent key stays absent rather than becoming a fresh wrong one', async () => {
  const slot = fakeSlot();

  await expect(browserDeviceBinding(slot).read()).rejects.toThrow(DeviceBindingUnavailableError);
  expect(await slot.load()).toBeNull();
});

test('removing the secret takes the key with it', async () => {
  const slot = fakeSlot();
  const binding = browserDeviceBinding(slot);
  await binding.create();
  await binding.remove();

  expect(await slot.load()).toBeNull();
});

test('the PIN and the device secret combine unambiguously', async () => {
  const secret = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';

  // No pair of (pin, secret) may collide with another by running together.
  expect(combinePinWithDevice('12', '34' + secret)).not.toBe(combinePinWithDevice('1234', secret));
  expect(combinePinWithDevice('1234', secret)).toBe(combinePinWithDevice('1234', secret));
  expect(combinePinWithDevice('1234', secret)).toContain('1234');
});

/* --- the phone's binding (ticket sec-02-06) ------------------------------ */

test('the Keystore binding is stable across reads, the same property the browser one has', async () => {
  const binding = keystoreDeviceBinding(fakeBridge());
  const minted = await binding.create();

  expect(await binding.read()).toBe(minted);
  expect(await binding.read()).toBe(minted);
});

test('the versioned label is what gets signed, so a later scheme can derive a different value from the same key', async () => {
  const labels: string[] = [];
  const bridge: PinBindingBridge = {
    create: async ({ label }) => {
      labels.push(label);
      return { secret: 'signed' };
    },
    read: async ({ label }) => {
      labels.push(label);
      return { secret: 'signed' };
    },
    erase: async () => {}
  };
  const binding = keystoreDeviceBinding(bridge);
  await binding.create();
  await binding.read();

  expect(labels).toEqual(['engender/pin-binding/v1', 'engender/pin-binding/v1']);
});

test('a phone with no alias left is its own failure rather than a wrong PIN', async () => {
  const bridge = fakeBridge();
  const binding = keystoreDeviceBinding(bridge);
  await binding.create();
  await binding.remove();

  expect(bridge.erased()).toBe(true);
  await expect(binding.read()).rejects.toThrow(DeviceBindingUnavailableError);
});

test('minting again replaces the key, so an abandoned attempt cannot open what the next one writes', async () => {
  const binding = keystoreDeviceBinding(fakeBridge());
  const abandoned = await binding.create();

  expect(await binding.create()).not.toBe(abandoned);
});

/* A bridge that answers a mint with no signature has bound nothing. Wrapping
   a journal under that answer would wrap it under `undefined` - openable by
   any device that also has no key - so it fails closed, the way every other
   bridge answer in this app does. */
test('a bridge that mints no secret is a failure rather than a secret of its own', async () => {
  const empty: PinBindingBridge = {
    create: async () => ({ secret: '' }),
    read: async () => ({ secret: null }),
    erase: async () => {}
  };

  await expect(keystoreDeviceBinding(empty).create()).rejects.toThrow(DeviceBindingUnavailableError);
});
