/* What a recovery key can be asked to do (ADR-0054, ticket sec-01), one
   level above the wrap: mint, open, replace, revoke.

   The same shape `journal-passphrase.ts` has for the keystore - "the wrap
   math plus where the bytes live" - so that the Settings screen and, later,
   the gates share one spelling of each operation rather than each composing
   the pieces itself.

   Ports rather than a direct import of the file store, for the reason
   `journal-pin.ts` has them: everything here is worth testing in the Node
   tier, and OPFS does not exist there. The platform default is the OPFS
   file on both web and Android - the recovery wrap is not a device-bound
   secret, so unlike PIN mode's binding there is nothing platform-specific
   to choose between. */

import {
  RecoveryWrapUnreadableError,
  parseRecoveryWrap,
  serializeRecoveryWrap,
  unwrapDataKeyWithRecoveryKey,
  wrapDataKeyWithRecoveryKey,
  type RecoveryWrap
} from '../crypto/recoveryWrap';
import { canonicalRecoveryKey, generateRecoveryKey } from '../crypto/recoveryKey';
import { readRecoveryWrapFile, removeRecoveryWrapFile, writeRecoveryWrapFile } from './recovery-key-file';

export interface RecoveryKeyPorts {
  read(): Promise<RecoveryWrap | null>;
  write(wrap: RecoveryWrap): Promise<void>;
  remove(): Promise<void>;
}

const filePorts: RecoveryKeyPorts = {
  read: readRecoveryWrapFile,
  write: writeRecoveryWrapFile,
  remove: removeRecoveryWrapFile
};

/** Thrown when a recovery key is offered to a journal that has none. Its
    own class rather than a wrong-key failure: the answer is "this journal
    has no recovery key", and telling somebody their paper is wrong when
    the journal never had any is the cruellest available message. */
export class RecoveryKeyAbsentError extends Error {
  constructor() {
    super('this journal has no recovery key');
    this.name = 'RecoveryKeyAbsentError';
  }
}

/** Mints a key, seals the data key under it, writes the file, and hands
    back the key in the form it is shown and written down. This is the only
    moment the string exists: nothing stores it, so nothing can show it
    again.

    Also how a key is replaced - writing over the file kills the old key,
    which is why there is no separate replace operation to keep in step.
    The caller has already opened the journal, which is what makes the data
    key available to seal. */
export async function mintRecoveryKey(
  dataKey: Uint8Array<ArrayBuffer>,
  ports: RecoveryKeyPorts = filePorts
): Promise<string> {
  const display = generateRecoveryKey();
  /* Minted through the parser rather than beside it: a generator that
     produced something the gate would reject is a journal nobody can
     recover, and this makes that impossible rather than unlikely. */
  const wrap = await wrapDataKeyWithRecoveryKey(dataKey, canonicalRecoveryKey(display));
  await ports.write(wrap);
  return display;
}

/** Opens the journal's data key with whatever somebody typed.

    Three failures, deliberately three: RecoveryKeyMistypedError for input
    that cannot be a key, RecoveryKeyAbsentError when there is no recovery
    key on this journal, and DecryptionFailedError for a well-formed key
    that is not this journal's. Only the last of those is "that was not
    right". */
export async function openWithRecoveryKey(
  typed: string,
  ports: RecoveryKeyPorts = filePorts
): Promise<Uint8Array<ArrayBuffer>> {
  const canonical = canonicalRecoveryKey(typed);
  const wrap = await ports.read();
  if (wrap === null) throw new RecoveryKeyAbsentError();
  return unwrapDataKeyWithRecoveryKey(wrap, canonical);
}

/** Whether this journal has a recovery key at all. What the Settings row
    reads, and what decides whether a gate offers the entry at all - asked
    before anything is typed, so that nobody is sent looking for paper they
    never had.

    A file this build cannot read counts as no recovery key rather than
    propagating: there is nothing a person can do about it, the offer to
    mint a fresh one is the only useful thing the screen can say, and
    minting overwrites the unreadable file. */
export async function recoveryKeyExists(ports: RecoveryKeyPorts = filePorts): Promise<boolean> {
  try {
    return (await ports.read()) !== null;
  } catch (error) {
    if (error instanceof RecoveryWrapUnreadableError) return false;
    throw error;
  }
}

/** Removes the recovery key. Tolerates its absence, because the caller's
    goal is that it is gone.

    Takes effect on the next boot rather than immediately, and the copy says
    so: a session that is already open holds the data key in memory and does
    not consult this file again. */
export async function revokeRecoveryKey(ports: RecoveryKeyPorts = filePorts): Promise<void> {
  await ports.remove();
}

/** An in-memory store, for tests and for the Node tier where OPFS does not
    exist. Exported from the module it belongs to rather than a test-support
    file, because it is four lines and its shape has to track the ports
    interface directly above it. */
export function inMemoryRecoveryKeyPorts(initial: RecoveryWrap | null = null): RecoveryKeyPorts {
  /* Held as the serialized text rather than the object, so that a test
     exercising mint-then-open goes through the same encode and decode a
     real boot does. A wrap that round-trips in memory but not through the
     file would otherwise pass every test here. */
  let stored = initial === null ? null : serializeRecoveryWrap(initial);
  return {
    read: async () => (stored === null ? null : parseRecoveryWrap(stored)),
    write: async (wrap) => {
      stored = serializeRecoveryWrap(wrap);
    },
    remove: async () => {
      stored = null;
    }
  };
}
