/* Share biometric setup, unlock and mode changes between boot and
   Settings. A verified authenticator supplies the WebAuthn PRF secret
   to the same wrap pipeline as passphrase and PIN (ADR-0041).
   A user cannot change the PRF output itself. Replacing its credential
   would require a separate authenticator-change flow.

   Inject storage and authenticator ports for Node tests. Data keys
   stay in memory (ADR-0018). */

import {
  createKeystore,
  unlockKeystore,
  wrapDataKeyWithSecret,
  KeystoreUnreadableError,
  type BiometricHandle,
  type KeystoreMetadata
} from '../crypto/keystore';
import { initializeJournal, journalAccessExists } from './journal-initialization';
import { readKeystoreFile, writeKeystoreFile } from './keystore-file';
import { browserAuthenticator, randomPrfSalt, type PrfAuthenticator } from './webauthn-prf';

/** Where a biometric keystore's two halves live: the authenticator that
    releases the secret, and the file that records how to ask it. Defaults to
    the real browser bindings; the tests hand in fakes. */
/* BiometricPorts stays exported only for its own test. */
export interface BiometricPorts {
  journalExists(): Promise<boolean>;
  authenticator: PrfAuthenticator;
  readKeystore(): Promise<KeystoreMetadata | null>;
  writeKeystore(metadata: KeystoreMetadata, current?: () => void): Promise<void>;
}

const browserPorts = (): BiometricPorts => ({
  journalExists: journalAccessExists,
  authenticator: browserAuthenticator(),
  readKeystore: readKeystoreFile,
  writeKeystore: writeKeystoreFile
});

/** First run: mints a credential and a salt, derives the secret, wraps a
    fresh data key under it, and records both public values beside the wrap
    so a later cold start needs nothing else. */
export async function setupJournalBiometric(ports: BiometricPorts = browserPorts()): Promise<Uint8Array<ArrayBuffer>> {
  return initializeJournal(async () => {
    const prfSalt = randomPrfSalt();
    const { credentialId, secret } = await ports.authenticator.enrol(prfSalt);
    const { metadata, dataKey } = await createKeystore(secret, undefined, 'biometric');
    await ports.writeKeystore({ ...metadata, biometric: { credentialId, prfSalt } });
    return dataKey;
  }, () => ports.journalExists());
}

/** Moves a journal that is already open into biometric mode - the Settings
    change, where the data key is in memory. A fresh credential and a fresh
    salt every time, because the previous mode's leftovers must not open what
    this writes.

    Nothing is destroyed before the new keystore lands: enrolling adds a
    credential rather than replacing one, so an interruption between the
    prompt and the write leaves the journal opening exactly as it did. That
    is the difference from PIN mode, which has to refuse this direction.
    The caller owns credential mutation through old-mode cleanup. */
export async function addJournalBiometric(
  dataKey: Uint8Array<ArrayBuffer>,
  ports: BiometricPorts = browserPorts(),
  current: () => void = () => {},
  beforeCredentialWrite: () => void = () => {}
): Promise<void> {
  const prfSalt = randomPrfSalt();
  const { credentialId, secret } = await ports.authenticator.enrol(prfSalt);
  const metadata = await wrapDataKeyWithSecret(dataKey, secret, undefined, 'biometric');
  current();
  beforeCredentialWrite();
  await ports.writeKeystore({ ...metadata, biometric: { credentialId, prfSalt } }, current);
}

/** Every later run. Throws BiometricUnavailableError when the authenticator
    will not answer - a dismissed prompt, a credential the device no longer
    holds, a browser that has stopped doing PRF - which is a different
    sentence from a wrong secret because retyping is not what fixes it. */
export async function unlockJournalBiometric(
  ports: BiometricPorts = browserPorts()
): Promise<Uint8Array<ArrayBuffer>> {
  const metadata = await requireBiometricKeystore(ports);
  const { credentialId, prfSalt } = metadata.biometric;
  return unlockKeystore(metadata, await ports.authenticator.evaluate(credentialId, prfSalt));
}

/* Boot decides which gate to draw from the keystore's own recorded source,
   so reaching here with anything else is a wiring mistake rather than a
   failed prompt. Named as one, for the reason journal-pin.ts states: the
   wrong profile would fail as a secret that does not work, at a screen with
   nothing to retype. */
async function requireBiometricKeystore(
  ports: BiometricPorts
): Promise<KeystoreMetadata & { biometric: BiometricHandle }> {
  const metadata = await ports.readKeystore();
  if (metadata === null) {
    throw new KeystoreUnreadableError('there is no keystore to unlock - boot decides setup vs unlock before calling this');
  }
  if (metadata.secretSource !== 'biometric') {
    throw new KeystoreUnreadableError(`this journal is unlocked by ${metadata.secretSource}, not by a biometric`);
  }
  /* parseKeystore already refuses a biometric keystore with no handle, so
     this only covers metadata that never went through it - and it is worth
     covering, because the alternative is asking the authenticator about
     `undefined`. */
  if (!metadata.biometric) {
    throw new KeystoreUnreadableError('this biometric keystore has no credential to ask');
  }
  return metadata as KeystoreMetadata & { biometric: BiometricHandle };
}
