/* What the long-journal probe leaves in the app's origin: nothing (ux-carpet
   216).

   The probe runs inside the app itself - LongJournalBenchmarkTest points the
   app's own WebView at it with setServerBasePath - so it shares the app's
   origin, https://localhost, and with it the app's OPFS and localStorage. The
   benchmark's unlock measurement calls addJournalPassphrase, which writes
   keystore.json into the OPFS root. On a phone whose journal is in unlocked or
   device-bound mode that root is otherwise empty, and a keystore there turns the
   next boot into a passphrase unlock for a passphrase nobody on that phone ever
   set. That is how the Pixel's demo journal was lost on 2026-09-24.

   So the probe takes a snapshot of both before it starts and puts them back
   when it ends, whether it passed or failed: every top-level OPFS entry that was
   not there before is removed, every file that was there gets its bytes back,
   and localStorage is returned key for key. Directories that existed before are
   left alone; the probe creates none.

   Written against the two small shapes below rather than the DOM types, so the
   Node tier can test it with fakes (origin-snapshot.test.ts). */

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
