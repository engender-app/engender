import { test, expect } from 'vitest';
import {
  createDeviceBoundMetadata,
  DeviceBoundKeyUnavailableError,
  parseDeviceBoundMetadata,
  serializeDeviceBoundMetadata,
  unlockDeviceBoundMetadata
} from './device-bound-journal.ts';

const slot = () => {
  let key: CryptoKey | null = null;
  return {
    async load() {
      return key;
    },
    async save(next: CryptoKey) {
      key = next;
    },
    async remove() {
      key = null;
    }
  };
};

async function makeWrapped(slotState = slot()) {
  const created = await createDeviceBoundMetadata(slotState);
  return { slotState, dataKey: created.dataKey, metadata: created.metadata };
}

test('creating device-bound metadata and unlocking it returns the same data key', async () => {
  const made = await makeWrapped();
  await expect(unlockDeviceBoundMetadata(made.metadata, made.slotState)).resolves.toEqual(made.dataKey);
});

test('device-bound metadata round-trips through its serialized form', async () => {
  const { metadata } = await makeWrapped();
  expect(parseDeviceBoundMetadata(serializeDeviceBoundMetadata(metadata))).toEqual(metadata);
});

test('device-bound metadata refuses a newer or different format', () => {
  expect(() => parseDeviceBoundMetadata('{"version":2,"kind":"device-bound"}')).toThrow(/format/);
  expect(() => parseDeviceBoundMetadata('{"version":1,"kind":"passphrase"}')).toThrow(/format/);
});

test('device-bound metadata refuses a file with missing fields by name', () => {
  expect(() => parseDeviceBoundMetadata('{"version":1,"kind":"device-bound"}')).toThrow(/missing fields/);
});

test('the lost-key error keeps its name for UI handling', () => {
  expect(new DeviceBoundKeyUnavailableError('missing').name).toBe('DeviceBoundKeyUnavailableError');
});

test('a missing browser key refuses as a lost-key state rather than bogus plaintext', async () => {
  const made = await makeWrapped();
  await made.slotState.remove();

  await expect(unlockDeviceBoundMetadata(made.metadata, made.slotState)).rejects.toThrow(DeviceBoundKeyUnavailableError);
});