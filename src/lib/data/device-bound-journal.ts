const DEVICE_BOUND_VERSION = 1;
const DATA_KEY_LENGTH = 32;
const DEVICE_BOUND_FILE = 'device-key.json';
const DEVICE_BOUND_DB = 'gender-diary-device-key';
const DEVICE_BOUND_STORE = 'keys';
const DEVICE_BOUND_SLOT = 'journal-device-key';

export interface DeviceBoundMetadata {
  version: typeof DEVICE_BOUND_VERSION;
  kind: 'device-bound';
  nonce: Uint8Array<ArrayBuffer>;
  wrappedKey: Uint8Array<ArrayBuffer>;
}

export interface DeviceKeySlot {
  load(): Promise<CryptoKey | null>;
  save(key: CryptoKey): Promise<void>;
  remove(): Promise<void>;
}

export class DeviceBoundKeyUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DeviceBoundKeyUnavailableError';
  }
}

export class DeviceBoundMetadataUnreadableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DeviceBoundMetadataUnreadableError';
  }
}

const toBase64 = (bytes: Uint8Array): string => btoa(String.fromCharCode(...bytes));
const fromBase64 = (text: string): Uint8Array<ArrayBuffer> =>
  Uint8Array.from(atob(text), (char) => char.charCodeAt(0));

const isNotFound = (error: unknown): boolean => (error as DOMException)?.name === 'NotFoundError';

function browserDeviceKeySlot(): DeviceKeySlot {
  return {
    async load() {
      const db = await openDeviceKeyDatabase();
      return runRequest<CryptoKey | null>(db.transaction(DEVICE_BOUND_STORE, 'readonly').objectStore(DEVICE_BOUND_STORE).get(DEVICE_BOUND_SLOT));
    },
    async save(key) {
      const db = await openDeviceKeyDatabase();
      await runRequest(db.transaction(DEVICE_BOUND_STORE, 'readwrite').objectStore(DEVICE_BOUND_STORE).put(key, DEVICE_BOUND_SLOT));
    },
    async remove() {
      const db = await openDeviceKeyDatabase();
      await runRequest(db.transaction(DEVICE_BOUND_STORE, 'readwrite').objectStore(DEVICE_BOUND_STORE).delete(DEVICE_BOUND_SLOT));
    }
  };
}

function openDeviceKeyDatabase(): Promise<IDBDatabase> {
  if (!('indexedDB' in globalThis)) {
    throw new DeviceBoundKeyUnavailableError('this browser cannot keep a device-bound journal key');
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DEVICE_BOUND_DB, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(DEVICE_BOUND_STORE)) db.createObjectStore(DEVICE_BOUND_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('could not open the device-key database'));
  });
}

function runRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('the browser key-store request failed'));
  });
}

async function generateWrappingKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

export async function setupDeviceBoundJournal(): Promise<Uint8Array<ArrayBuffer>> {
  const slot = browserDeviceKeySlot();
  const { dataKey, metadata } = await createDeviceBoundMetadata(slot);
  await writeDeviceBoundMetadata(metadata);
  return dataKey;
}

export async function deviceBoundJournalExists(): Promise<boolean> {
  return (await readDeviceBoundMetadata()) !== null;
}

export async function unlockDeviceBoundJournal(): Promise<Uint8Array<ArrayBuffer>> {
  const metadata = await readDeviceBoundMetadata();
  if (metadata === null) {
    throw new DeviceBoundKeyUnavailableError('there is no device-bound journal metadata to unlock');
  }

  const wrappingKey = await browserDeviceKeySlot().load();
  if (wrappingKey === null) {
    throw new DeviceBoundKeyUnavailableError('the browser no longer has the local key this journal was tied to');
  }

  try {
    return decryptWithCryptoKey(wrappingKey, metadata.nonce, metadata.wrappedKey);
  } catch {
    throw new DeviceBoundKeyUnavailableError('the browser no longer has the local key this journal was tied to');
  }
}

export async function removeDeviceBoundJournal(): Promise<void> {
  await browserDeviceKeySlot().remove().catch(() => {});
  await removeDeviceBoundMetadata().catch(() => {});
}

export async function createDeviceBoundMetadata(
  slot: DeviceKeySlot
): Promise<{ dataKey: Uint8Array<ArrayBuffer>; metadata: DeviceBoundMetadata }> {
  const wrappingKey = await generateWrappingKey();
  const dataKey = crypto.getRandomValues(new Uint8Array(DATA_KEY_LENGTH));
  const metadata = await wrapDeviceBoundDataKey(dataKey, wrappingKey);
  await slot.save(wrappingKey);
  return { dataKey, metadata };
}

export async function unlockDeviceBoundMetadata(
  metadata: DeviceBoundMetadata,
  slot: DeviceKeySlot
): Promise<Uint8Array<ArrayBuffer>> {
  const wrappingKey = await slot.load();
  if (wrappingKey === null) {
    throw new DeviceBoundKeyUnavailableError('the browser no longer has the local key this journal was tied to');
  }

  try {
    return decryptWithCryptoKey(wrappingKey, metadata.nonce, metadata.wrappedKey);
  } catch {
    throw new DeviceBoundKeyUnavailableError('the browser no longer has the local key this journal was tied to');
  }
}

export function serializeDeviceBoundMetadata(metadata: DeviceBoundMetadata): string {
  return JSON.stringify({
    version: metadata.version,
    kind: metadata.kind,
    nonce: toBase64(metadata.nonce),
    wrappedKey: toBase64(metadata.wrappedKey)
  });
}

export function parseDeviceBoundMetadata(serialized: string): DeviceBoundMetadata {
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(serialized) as Record<string, unknown>;
  } catch {
    throw new DeviceBoundMetadataUnreadableError('device-bound key metadata is not JSON');
  }

  if (raw.version !== DEVICE_BOUND_VERSION || raw.kind !== 'device-bound') {
    throw new DeviceBoundMetadataUnreadableError('device-bound key metadata is from a format this build cannot read');
  }

  if (typeof raw.nonce !== 'string' || typeof raw.wrappedKey !== 'string') {
    throw new DeviceBoundMetadataUnreadableError('device-bound key metadata is missing fields');
  }

  return {
    version: DEVICE_BOUND_VERSION,
    kind: 'device-bound',
    nonce: fromBase64(raw.nonce),
    wrappedKey: fromBase64(raw.wrappedKey)
  };
}

async function readDeviceBoundMetadata(): Promise<DeviceBoundMetadata | null> {
  const root = await navigator.storage.getDirectory();
  try {
    const handle = await root.getFileHandle(DEVICE_BOUND_FILE);
    return parseDeviceBoundMetadata(await (await handle.getFile()).text());
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

async function writeDeviceBoundMetadata(metadata: DeviceBoundMetadata): Promise<void> {
  const root = await navigator.storage.getDirectory();
  const handle = await root.getFileHandle(DEVICE_BOUND_FILE, { create: true });
  const writable = await handle.createWritable();
  try {
    await writable.write(serializeDeviceBoundMetadata(metadata));
  } finally {
    await writable.close();
  }
}

async function removeDeviceBoundMetadata(): Promise<void> {
  const root = await navigator.storage.getDirectory();
  await root.removeEntry(DEVICE_BOUND_FILE);
}

async function wrapDeviceBoundDataKey(
  dataKey: Uint8Array<ArrayBuffer>,
  wrappingKey: CryptoKey
): Promise<DeviceBoundMetadata> {
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, wrappingKey, dataKey));
  return { version: DEVICE_BOUND_VERSION, kind: 'device-bound', nonce, wrappedKey: ciphertext };
}

async function decryptWithCryptoKey(
  wrappingKey: CryptoKey,
  nonce: Uint8Array<ArrayBuffer>,
  wrappedKey: Uint8Array<ArrayBuffer>
): Promise<Uint8Array<ArrayBuffer>> {
  try {
    return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, wrappingKey, wrappedKey));
  } catch {
    throw new DeviceBoundKeyUnavailableError('the browser refused to use its stored device-bound key');
  }
}