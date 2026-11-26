/* Snapshot OPFS and localStorage before benchmarking in the app
   WebView's origin. The unlock probe can write keystore.json that
   would affect the next boot. Restore on success or failure: remove
   new top-level OPFS entries, restore existing file bytes, leave
   existing directories alone, and restore localStorage key for key.
   The probe creates no directories. Node tests supply fakes. */

export interface OriginFile {
  readonly kind: 'file';
  getFile(): Promise<{ arrayBuffer(): Promise<ArrayBuffer> }>;
  createWritable(): Promise<{ write(data: ArrayBuffer): Promise<void>; close(): Promise<void> }>;
}

export interface OriginDirectory {
  entries(): AsyncIterable<[string, OriginFile | { readonly kind: 'directory' }]>;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<OriginFile>;
  removeEntry(name: string, options?: { recursive?: boolean }): Promise<void>;
}

export interface OriginStorage {
  readonly length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Snapshots `root` and `storage`, and returns the function that restores
    them. It reports what it changed, so a run's log says what the probe left. */
export async function snapshotOrigin(
  root: OriginDirectory,
  storage: OriginStorage
): Promise<() => Promise<string[]>> {
  const files = new Map<string, ArrayBuffer>();
  const directories = new Set<string>();
  for await (const [name, handle] of root.entries()) {
    if (handle.kind === 'file') files.set(name, await (await handle.getFile()).arrayBuffer());
    else directories.add(name);
  }
  const stored = new Map<string, string>();
  for (const key of keysOf(storage)) stored.set(key, storage.getItem(key) ?? '');

  return async () => {
    const changed: string[] = [];
    const now: string[] = [];
    for await (const [name] of root.entries()) now.push(name);
    for (const name of now) {
      if (files.has(name) || directories.has(name)) continue;
      await root.removeEntry(name, { recursive: true });
      changed.push(`removed ${name}`);
    }
    for (const [name, bytes] of files) {
      const handle = await root.getFileHandle(name, { create: true });
      if (sameBytes(await (await handle.getFile()).arrayBuffer(), bytes)) continue;
      const writable = await handle.createWritable();
      await writable.write(bytes);
      await writable.close();
      changed.push(`restored ${name}`);
    }
    for (const key of keysOf(storage)) {
      if (stored.has(key)) continue;
      storage.removeItem(key);
      changed.push(`removed localStorage ${key}`);
    }
    for (const [key, value] of stored) {
      if (storage.getItem(key) === value) continue;
      storage.setItem(key, value);
      changed.push(`restored localStorage ${key}`);
    }
    return changed;
  };
}

function keysOf(storage: OriginStorage): string[] {
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key !== null) keys.push(key);
  }
  return keys;
}

function sameBytes(a: ArrayBuffer, b: ArrayBuffer): boolean {
  if (a.byteLength !== b.byteLength) return false;
  const x = new Uint8Array(a);
  const y = new Uint8Array(b);
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return false;
  return true;
}
