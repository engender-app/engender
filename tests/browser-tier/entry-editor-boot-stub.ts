// This fixture opens its journal below the keystore, using the same key for draft recovery.
import { PROBE_DATA_KEY } from './fresh-origin';
import type { prepareRecoveryKeyChange as prepareBootRecoveryKeyChange } from '../../src/lib/stores/boot.svelte';
import { protectionChange } from '../../src/lib/data/protection-change';
import { readKeystoreText } from '../../src/lib/data/keystore-file';
import { unlockJournalPassphrase } from '../../src/lib/data/journal-passphrase';
import { mintRecoveryKeyOwned } from '../../src/lib/data/recovery-key';
import { UnlockCancelledError } from '../../src/lib/lock/unlock-attempt';

export * from '../../src/lib/stores/boot.svelte';

export async function journalDataKey(): Promise<Uint8Array<ArrayBuffer>> {
  return PROBE_DATA_KEY;
}

// Mounted screen fixtures have no boot session. Keep fresh passphrase proof
// and the real serialized pending-wrap publication for their recovery screen.
export const prepareRecoveryKeyChange: typeof prepareBootRecoveryKeyChange = (_prompt, current) => protectionChange({
  current,
  readCredential: readKeystoreText,
  authenticate: async (secret, check) => {
    const opened = await unlockJournalPassphrase(secret);
    try {
      check();
      if (opened.length !== PROBE_DATA_KEY.length || !opened.every((byte, index) => byte === PROBE_DATA_KEY[index])) {
        throw new UnlockCancelledError();
      }
    } finally { opened.fill(0); }
  },
  mutate: check => mintRecoveryKeyOwned(PROBE_DATA_KEY, check)
});
