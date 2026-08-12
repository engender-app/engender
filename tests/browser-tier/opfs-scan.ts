/* The closed-app inspection the spec's release gate describes (ticket 09):
   read every file OPFS holds - SAHPool pool files, the keystore, photos,
   everything - and report which sentinel byte patterns appear where. If a
   sentinel planted through the app's own write paths is readable in any
   persistent file, the encryption claim is false and no passing API read
   can rescue it. Grown from the ticket 08 prototype's scanner
   (prototype/encryption/web/opfs-scan.ts on prototype/encryption-mechanism). */

export interface ScannedFile {
  path: string;
  size: number;
  /** Labels of the sentinel patterns found in this file's raw bytes. */
  found: string[];
}

export interface Sentinel {
  label: string;
  bytes: Uint8Array;
  /** Only counts at byte 0 - for file signatures like JPEG's, whose three
      bytes would sooner or later occur by chance inside megabytes of
      ciphertext, where they mean nothing. */
  atStartOnly?: boolean;
}

export const textSentinel = (label: string, text: string): Sentinel => ({
  label,
  bytes: new TextEncoder().encode(text)
});

async function* walk(
  dir: FileSystemDirectoryHandle,
  prefix: string
): AsyncGenerator<{ path: string; handle: FileSystemFileHandle }> {
  // TypeScript's DOM lib misses the async iteration the spec defines, same
  // as ListableDirectory works around in opfs-file-store.ts.
  const entries = (dir as unknown as { entries(): AsyncIterableIterator<[string, FileSystemHandle]> }).entries();
  for await (const [name, handle] of entries) {
    if (handle.kind === 'file') yield { path: `${prefix}/${name}`, handle: handle as FileSystemFileHandle };
    else yield* walk(handle as FileSystemDirectoryHandle, `${prefix}/${name}`);
  }
}

function contains(haystack: Uint8Array, needle: Uint8Array, atStartOnly: boolean): boolean {
  const last = atStartOnly ? 0 : haystack.length - needle.length;
  outer: for (let i = 0; i <= last; i++) {
    for (let j = 0; j < needle.length; j++) if (haystack[i + j] !== needle[j]) continue outer;
    return true;
  }
  return false;
}

export async function scanOpfs(sentinels: Sentinel[]): Promise<ScannedFile[]> {
  const root = await navigator.storage.getDirectory();
  const files: ScannedFile[] = [];
  for await (const { path, handle } of walk(root, '')) {
    const bytes = new Uint8Array(await (await handle.getFile()).arrayBuffer());
    files.push({
      path,
      size: bytes.length,
      found: sentinels.filter((s) => contains(bytes, s.bytes, s.atStartOnly ?? false)).map((s) => s.label)
    });
  }
  return files;
}

/** The same question asked of localStorage, where the boot mirror and the
    PIN throttle live: no sentinel may appear in any stored value. */
export function scanLocalStorage(sentinels: Sentinel[]): { key: string; found: string[] }[] {
  const decoder = new TextDecoder();
  const results: { key: string; found: string[] }[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)!;
    const value = localStorage.getItem(key) ?? '';
    const found = sentinels.filter((s) => value.includes(decoder.decode(s.bytes))).map((s) => s.label);
    results.push({ key, found });
  }
  return results;
}
