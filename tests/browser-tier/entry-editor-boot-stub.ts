// This fixture opens its journal below the keystore, using the same key for draft recovery.
import { PROBE_DATA_KEY } from './fresh-origin';
export * from '../../src/lib/stores/boot.svelte';

export async function journalDataKey(): Promise<Uint8Array<ArrayBuffer>> {
  return PROBE_DATA_KEY;
}
