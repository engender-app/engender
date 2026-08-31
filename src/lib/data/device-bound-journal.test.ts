import { test, expect, vi } from 'vitest';
import {
  createDeviceBoundMetadata,
  deleteDeviceKeyDatabase,
  DeviceBoundKeyUnavailableError,
  parseDeviceBoundMetadata,
  serializeDeviceBoundMetadata,
  unlockDeviceBoundMetadata
} from './device-bound-journal.ts';

/* A stand-in for the one IndexedDB call deleteDeviceKeyDatabase makes.
   Node has no indexedDB global at all (ADR: ticket 03's node tier), so
   there is nothing real to call through to - only the request shape to
   fake. */
function fakeIndexedDb(behavior: 'success' | 'error') {
  const calls: string[] = [];
  const request = {} as IDBOpenDBRequest;
  return {
    calls,
    indexedDB: {
      deleteDatabase(name: string) {
        calls.push(name);
        queueMicrotask(() => {
          if (behavior === 'success') request.onsuccess?.(new Event('success'));
          else {
            (request as { error: DOMException | null }).error = new DOMException('blocked by another tab');
            request.onerror?.(new Event('error'));
          }
        });
        return request;
      }
    } as unknown as IDBFactory
  };
}

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

test('resetting takes the whole device-key database, not one named slot', async () => {
  const { calls, indexedDB } = fakeIndexedDb('success');
  vi.stubGlobal('indexedDB', indexedDB);

  await deleteDeviceKeyDatabase();

  expect(calls).toEqual(['gender-diary-device-key']);
  vi.unstubAllGlobals();
});

test('a database the browser refuses to delete rejects rather than pretending the reset took it', async () => {
  const { indexedDB } = fakeIndexedDb('error');
  vi.stubGlobal('indexedDB', indexedDB);

  await expect(deleteDeviceKeyDatabase()).rejects.toThrow('blocked by another tab');
  vi.unstubAllGlobals();
});

test('a browser with no IndexedDB at all has nothing to delete, so this resolves rather than throwing', async () => {
  // No stub here: Node's own globalThis has no indexedDB, which is exactly
  // the environment this branch exists for.
  expect('indexedDB' in globalThis).toBe(false);
  await expect(deleteDeviceKeyDatabase()).resolves.toBeUndefined();
});
