/* Probe pages share one browser context per run (run.mjs), and with the
   encrypted driver they also share one SAHPool VFS whose capacity is fixed
   when the pool is first created (mc-worker.ts) - so leftovers from the
   probes before this one would eventually run the pool out of slots.
   Each probe empties the origin's storage before it begins instead.

   The one probe that gets reloaded to prove persistence guards the wipe
   with sessionStorage, which survives a reload but not a new context. */

export async function freshOrigin(onceKey?: string): Promise<void> {
  if (onceKey) {
    if (sessionStorage.getItem(onceKey)) return;
    sessionStorage.setItem(onceKey, 'done');
  }
  localStorage.clear();
  const root = await navigator.storage.getDirectory();
  for await (const name of (root as unknown as { keys(): AsyncIterableIterator<string> }).keys()) {
    await root.removeEntry(name, { recursive: true }).catch(() => {});
  }
}

/** A raw 32-byte data key for probes that sit below the keystore - what
    ADR-0018's unwrap hands the driver, minus the passphrase ceremony the
    encryption probe covers. Fixed, not random, so a probe that reloads
    opens its database again. */
export const PROBE_DATA_KEY = new Uint8Array(32).fill(7);
