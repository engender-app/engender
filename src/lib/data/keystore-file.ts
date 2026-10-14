/* Credential wraps live in OPFS on the web and in a durable app-private
   file on Android. The native store becomes authoritative before an old
   OPFS record is removed; a native tombstone prevents adopting it again. */

import { parseKeystore, serializeKeystore, type JournalSecretSource, type KeystoreMetadata } from '../crypto/keystore';
import { isAndroid } from '../platform';
import { androidPluginOwners, registerAndroidPlugin } from '../android/plugin-registry';

interface CredentialWrapBridge {
  readCredential(): Promise<{ initialized: boolean; serialized?: string }>;
  adoptCredential(options: { serialized: string }): Promise<{ initialized: boolean; serialized?: string }>;
  writeCredential(options: { serialized: string }): Promise<void>;
  removeCredential(): Promise<void>;
}

const androidWraps = registerAndroidPlugin<CredentialWrapBridge>(androidPluginOwners.keystore);

/* KEYSTORE_FILE stays exported only for conversion-probe.ts, which
   cross-checks against it (AU-09 test-only review). */
export const KEYSTORE_FILE = 'keystore.json';

const isNotFound = (error: unknown): boolean => (error as DOMException)?.name === 'NotFoundError';

/** The stored metadata, or null on a first run - which is what tells boot
    to offer setup rather than unlock. */
export async function readKeystoreFile(): Promise<KeystoreMetadata | null> {
  if (isAndroid()) {
    const native = await androidWraps.readCredential();
    if (native.initialized) return native.serialized === undefined ? null : parseKeystore(native.serialized);
    const legacy = await readOpfsKeystore();
    if (legacy === null) return null;
    // Adoption cannot replace a native record another caller has just published.
    const adopted = await androidWraps.adoptCredential({ serialized: serializeKeystore(legacy) });
    await removeOpfsKeystore();
    return adopted.serialized === undefined ? null : parseKeystore(adopted.serialized);
  }
  return readOpfsKeystore();
}

async function readOpfsKeystore(): Promise<KeystoreMetadata | null> {
  const root = await navigator.storage.getDirectory();
  try {
    const handle = await root.getFileHandle(KEYSTORE_FILE);
    return parseKeystore(await (await handle.getFile()).text());
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

export async function writeKeystoreFile(metadata: KeystoreMetadata): Promise<void> {
  /* Serialized before the file is opened, because createWritable() truncates
     and serializeKeystore can refuse metadata (a biometric keystore with no
     credential id). Building the text first means a refusal leaves the old
     keystore where it was rather than emptying it. */
  const serialized = serializeKeystore(metadata);
  if (isAndroid()) {
    // A native persistence failure must never fall back to the WebView store.
    await androidWraps.writeCredential({ serialized });
    return;
  }
  const root = await navigator.storage.getDirectory();
  const handle = await root.getFileHandle(KEYSTORE_FILE, { create: true });
  const writable = await handle.createWritable();
  /* One write, and the swap file behind it is what makes every rewrap in the
     web app safe from a process interruption: without `keepExistingData` the
     writable is a swap file that only replaces the real one on close(), so a
     process that dies mid-write leaves the previous keystore intact.
     close() does not promise persistence through power loss on the web. The
     access-mode changes and PIN mode's rebinding (data/journal-pin.ts) both
     state that an interruption leaves a journal openable under one secret or
     the other, and this is the half of that claim which is not about
     ordering. */
  try {
    await writable.write(serialized);
    await writable.close();
  } catch (error) {
    await writable.abort().catch(() => {});
    throw error;
  }
}

/** Which kind of secret opens this journal, or null on a first run. What
    boot's survey asks (ticket 53): the mode is a property of the keystore
    rather than something tracked beside it, so there is nothing to drift. */
export async function readKeystoreSource(): Promise<JournalSecretSource | null> {
  return (await readKeystoreFile())?.secretSource ?? null;
}

/** Removes the keystore, for a move to device-bound mode where there is no
    secret to wrap under any more. Tolerates an absent file: the caller's
    goal is that it is gone. */
export async function removeKeystoreFile(): Promise<void> {
  if (isAndroid()) await androidWraps.removeCredential();
  await removeOpfsKeystore();
}

async function removeOpfsKeystore(): Promise<void> {
  const root = await navigator.storage.getDirectory();
  try {
    await root.removeEntry(KEYSTORE_FILE);
  } catch (error) {
    if (!isNotFound(error)) throw error;
  }
}
