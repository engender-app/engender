/* Biometric mode's flows (ticket 55), the sibling of journal-pin.ts and the
   same shape: the keystore math plus where the metadata lives, so boot and
   the settings screen share one spelling of setup, unlock and change.

   The only difference from the other two secret modes is where the string
   comes from. A passphrase is typed and a PIN is typed and bound; this one
   is released by a platform authenticator that has just verified who is
   present (webauthn-prf.ts). From the wrap down, all three are identical -
   which is the whole point of ADR-0041's one pipeline.

   There is no change-my-secret flow here, and it is an absence rather than
   an omission: a PRF output is not something a person chooses, so the only
   thing that could change is which credential produces it. That is a change
   of authenticator, which would be this app's first recovery-shaped feature
   and is explicitly out of ticket 55's scope.

   Like journal-pin.ts this takes its ports rather than reaching for OPFS and
   the browser's WebAuthn directly, so the Node tier can round-trip the mode
   against a fake authenticator.

   The returned data keys live in memory and nowhere else, exactly as
   ADR-0018 requires. */

import {
  createKeystore,
  unlockKeystore,
  wrapDataKeyWithSecret,
  KeystoreUnreadableError,
  type KeystoreMetadata
} from '../crypto/keystore';
import { readKeystoreFile, writeKeystoreFile } from './keystore-file';
import { browserAuthenticator, randomPrfSalt, type PrfAuthenticator } from './webauthn-prf';

/** Where a biometric keystore's two halves live: the authenticator that
    releases the secret, and the file that records how to ask it. Defaults to
    the real browser bindings; the tests hand in fakes. */
export interface BiometricPorts {
  authenticator: PrfAuthenticator;
  readKeystore(): Promise<KeystoreMetadata | null>;
  writeKeystore(metadata: KeystoreMetadata): Promise<void>;
}

const browserPorts = (): BiometricPorts => ({
  authenticator: browserAuthenticator(),
  readKeystore: readKeystoreFile,
  writeKeystore: writeKeystoreFile
});

/** First run: mints a credential and a salt, derives the secret, wraps a
    fresh data key under it, and records both public values beside the wrap
    so a later cold start needs nothing else. */
export async function setupJournalBiometric(ports: BiometricPorts = browserPorts()): Promise<Uint8Array<ArrayBuffer>> {
  const prfSalt = randomPrfSalt();
  const { credentialId, secret } = await ports.authenticator.enrol(prfSalt);
  const { metadata, dataKey } = await createKeystore(secret, undefined, 'biometric');
  await ports.writeKeystore({ ...metadata, biometric: { credentialId, prfSalt } });
  return dataKey;
}

/** Moves a journal that is already open into biometric mode - the Settings
    change, where the data key is in memory. A fresh credential and a fresh
    salt every time, because the previous mode's leftovers must not open what
    this writes.

    Nothing is destroyed before the new keystore lands: enrolling adds a
    credential rather than replacing one, so an interruption between the
    prompt and the write leaves the journal opening exactly as it did. That
    is the difference from PIN mode, which has to refuse this direction. */
export async function addJournalBiometric(
  dataKey: Uint8Array<ArrayBuffer>,
  ports: BiometricPorts = browserPorts()
): Promise<void> {
  const prfSalt = randomPrfSalt();
  const { credentialId, secret } = await ports.authenticator.enrol(prfSalt);
  const metadata = await wrapDataKeyWithSecret(dataKey, secret, undefined, 'biometric');
  await ports.writeKeystore({ ...metadata, biometric: { credentialId, prfSalt } });
}

/** Every later run. Throws BiometricUnavailableError when the authenticator
    will not answer - a dismissed prompt, a credential the device no longer
    holds, a browser that has stopped doing PRF - which is a different
    sentence from a wrong secret because retyping is not what fixes it. */
export async function unlockJournalBiometric(
  ports: BiometricPorts = browserPorts()
): Promise<Uint8Array<ArrayBuffer>> {
  const metadata = await requireBiometricKeystore(ports);
  const { credentialId, prfSalt } = metadata.biometric!;
  return unlockKeystore(metadata, await ports.authenticator.evaluate(credentialId, prfSalt));
}

/* Boot decides which gate to draw from the keystore's own recorded source,
   so reaching here with anything else is a wiring mistake rather than a
   failed prompt. Named as one, for the reason journal-pin.ts states: the
   wrong profile would fail as a secret that does not work, at a screen with
   nothing to retype. */
async function requireBiometricKeystore(ports: BiometricPorts): Promise<KeystoreMetadata> {
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
  return metadata;
}
