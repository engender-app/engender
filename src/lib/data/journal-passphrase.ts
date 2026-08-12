/* The web passphrase flows (ticket 09), one level above the pure keystore:
   each of these is "the keystore math plus where the metadata lives", so
   boot and the settings screen share one spelling of setup, unlock and
   change instead of each composing keystore.ts with keystore-file.ts
   themselves.

   The returned data keys live in memory and nowhere else. A page unload
   drops them, which is exactly ADR-0018's session rule: the passphrase is
   required again after the browser process ends. */

import { createKeystore, rewrapKeystore, unlockKeystore } from '../crypto/keystore';
import { readKeystoreFile, writeKeystoreFile } from './keystore-file';

/** One floor, shared by the setup screen and the change screen, so the two
    cannot drift into accepting different passphrases. A floor and nothing
    more: strength ultimately comes from the KDF cost (ADR-0013) and the
    person's own choice, and copy - not code - is what pushes toward a
    password manager. */
export const MIN_PASSPHRASE_LENGTH = 8;

/** Null on a first run - the signal that boot should offer setup. */
export async function journalKeystoreExists(): Promise<boolean> {
  return (await readKeystoreFile()) !== null;
}

/** First run: mints the data key, wraps it under the passphrase, persists
    the metadata, hands back the key for this session. */
export async function setupJournalPassphrase(passphrase: string): Promise<Uint8Array<ArrayBuffer>> {
  const { metadata, dataKey } = await createKeystore(passphrase);
  await writeKeystoreFile(metadata);
  return dataKey;
}

/** Every later run: throws DecryptionFailedError on a wrong passphrase,
    KeystoreUnreadableError on a keystore this build cannot read. */
export async function unlockJournalPassphrase(passphrase: string): Promise<Uint8Array<ArrayBuffer>> {
  const metadata = await readKeystoreFile();
  if (metadata === null) throw new Error('no keystore to unlock - boot decides setup vs unlock before calling this');
  return unlockKeystore(metadata, passphrase);
}

/** Rewraps the same data key under a new passphrase (ticket 09: a change
    of passphrase never re-encrypts the Journal). Throws
    DecryptionFailedError when the current passphrase is wrong, before
    anything is written. */
export async function changeJournalPassphrase(current: string, next: string): Promise<void> {
  const metadata = await readKeystoreFile();
  if (metadata === null) throw new Error('no keystore to rewrap');
  await writeKeystoreFile(await rewrapKeystore(metadata, current, next));
}
