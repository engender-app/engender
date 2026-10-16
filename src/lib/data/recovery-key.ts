/* What a recovery key can be asked to do (ADR-0054, ticket sec-01), one
   level above the wrap: mint, finish, open, discard, revoke.

   The same shape `journal-passphrase.ts` has for the keystore - "the wrap
   math plus where the bytes live" - so that the Settings screen and, later,
   the gates share one spelling of each operation rather than each composing
   the pieces itself.

   Two slots since last-audit UI 42. `active` is the key the journal has;
   `pending` is a new key that has been shown but not yet confirmed as
   written down. Minting writes only `pending`, so the old key keeps opening
   the journal until the person confirms they have the new one, and a
   process that dies between minting and confirming leaves a key that works
   rather than a key nobody saw. Confirming is the commit: the pending wrap
   is written over the active one, which is the only moment the old key stops
   working, and then the pending file goes. While a pending wrap exists both
   keys open the journal; that window is the accepted cost.

   Only wraps are stored. The characters of a key are never written
   anywhere, sealed or not, which is why finishing an interrupted
   replacement asks the person to type the new key rather than showing it.

   Ports rather than a direct import of the file store, for the reason
   `journal-pin.ts` has them: everything here is worth testing in the Node
   tier, and OPFS does not exist there. The platform default is the OPFS
   file on both web and Android - the recovery wrap is not a device-bound
   secret, so unlike PIN mode's binding there is nothing platform-specific
   to choose between. */

import { authenticateCredentials, changeCredentials, CredentialsBusyError } from './credential-ownership';
import {
  RecoveryWrapUnreadableError,
  parseRecoveryWrap,
  serializeRecoveryWrap,
  unwrapDataKeyWithRecoveryKey,
  wrapDataKeyWithRecoveryKey,
  type RecoveryWrap
} from '../crypto/recoveryWrap';
import { canonicalRecoveryKey, generateRecoveryKey } from '../crypto/recoveryKey';
import { DecryptionFailedError } from '../crypto/aesGcm';
import {
  PENDING_RECOVERY_KEY_FILE,
  RECOVERY_KEY_FILE,
  readRecoveryWrapFile,
  removeRecoveryWrapFile,
  writeRecoveryWrapFile
} from './recovery-key-file';

interface RecoveryWrapSlot {
  read(): Promise<RecoveryWrap | null>;
  write(wrap: RecoveryWrap): Promise<void>;
  remove(): Promise<void>;
}

interface RecoveryKeyPorts {
  active: RecoveryWrapSlot;
  pending: RecoveryWrapSlot;
}

const fileSlot = (name: string): RecoveryWrapSlot => ({
  read: () => readRecoveryWrapFile(name),
  write: (wrap) => writeRecoveryWrapFile(wrap, name),
  remove: () => removeRecoveryWrapFile(name)
});

const filePorts: RecoveryKeyPorts = {
  active: fileSlot(RECOVERY_KEY_FILE),
  pending: fileSlot(PENDING_RECOVERY_KEY_FILE)
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

/** Thrown when a key is offered to finish a replacement that is no longer
    waiting: it was finished, discarded, or replaced by a newer key. */
export class RecoveryKeyNotPendingError extends Error {
  constructor() {
    super('no new recovery key is waiting to be confirmed');
    this.name = 'RecoveryKeyNotPendingError';
  }
}

const sameWrap = (a: RecoveryWrap, b: RecoveryWrap) => serializeRecoveryWrap(a) === serializeRecoveryWrap(b);

/** A slot this build cannot read counts as empty for the pending key: there
    is nothing a person can do about it, and the next mint overwrites it. */
async function readReadable(slot: RecoveryWrapSlot): Promise<RecoveryWrap | null> {
  try {
    return await slot.read();
  } catch (error) {
    if (error instanceof RecoveryWrapUnreadableError) return null;
    throw error;
  }
}

/** Mints a key, seals the data key under it, writes the pending slot, and
    hands back the key in the form it is shown and written down. This is the
    only moment the string exists: nothing stores it, so nothing can show it
    again.

    Also how a key is replaced, and the old key is untouched by it: it keeps
    opening the journal until `finishRecoveryKey` promotes this one. A pending
    key from an earlier, interrupted replacement is overwritten, so that key
    stops working here. The caller has already opened the journal, which is
    what makes the data key available to seal. */
export async function mintRecoveryKey(
  dataKey: Uint8Array<ArrayBuffer>,
  ports: RecoveryKeyPorts = filePorts
): Promise<string> {
  return changeCredentials(async () => {
    const display = generateRecoveryKey();
    /* Minted through the parser rather than beside it: a generator that
       produced something the gate would reject is a journal nobody can
       recover, and this makes that impossible rather than unlikely. */
    const wrap = await wrapDataKeyWithRecoveryKey(dataKey, canonicalRecoveryKey(display));
    await ports.pending.write(wrap);
    return display;
  });
}

/* Write-then-remove, and the order is the crash safety. A cut after the
   write leaves both slots holding the same wrap, which `recoveryKeyState`
   recognises and tidies; a cut before it leaves the old key working. The
   pending wrap is compared with the one that was opened so a key can only
   promote the wrap it actually opens. */
async function promoteOwned(opened: RecoveryWrap, ports: RecoveryKeyPorts): Promise<void> {
  const pending = await readReadable(ports.pending);
  if (pending === null || !sameWrap(pending, opened)) throw new RecoveryKeyNotPendingError();
  await ports.active.write(opened);
  await ports.pending.remove();
}

/** Confirms the pending key, given its characters: the screen's "I have
    written it down" passes the key it is showing, and an interrupted
    replacement passes what the person types. Opening the pending wrap is
    the proof of possession, so this never promotes a key the person was not
    shown. After it, the old key opens nothing.

    Throws RecoveryKeyMistypedError for input that cannot be a key,
    DecryptionFailedError for a key that is not the pending one, and
    RecoveryKeyNotPendingError when no new key is waiting. */
export async function finishRecoveryKey(typed: string, ports: RecoveryKeyPorts = filePorts): Promise<void> {
  const canonical = canonicalRecoveryKey(typed);
  const pending = await readReadable(ports.pending);
  if (pending === null) throw new RecoveryKeyNotPendingError();
  (await unwrapDataKeyWithRecoveryKey(pending, canonical)).fill(0);
  await changeCredentials(() => promoteOwned(pending, ports));
}

/** Opens the journal's data key with whatever somebody typed: the active
    key first, then a pending one. A pending key that opens the journal is
    promoted on the way in, because whoever typed it evidently has it; a
    promotion that cannot run now is left for the notice to finish and does
    not stand between the person and their journal.

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
  const pending = await readReadable(ports.pending);
  let active: RecoveryWrap | null;
  try {
    active = await ports.active.read();
  } catch (error) {
    if (pending === null) throw error;
    active = null;
  }
  if (active === null && pending === null) throw new RecoveryKeyAbsentError();
  if (active !== null) {
    try {
      return await unwrapDataKeyWithRecoveryKey(active, canonical);
    } catch (error) {
      if (pending === null || !(error instanceof DecryptionFailedError)) throw error;
    }
  }
  const dataKey = await unwrapDataKeyWithRecoveryKey(pending!, canonical);
  await changeCredentials(() => promoteOwned(pending!, ports)).catch((error) => {
    console.warn('the pending recovery key opened the journal but could not be confirmed yet', error);
  });
  return dataKey;
}

/** What Settings, the gates and Home ask before anything is typed: whether
    this journal has a confirmed recovery key, and whether a new one is
    waiting to be confirmed.

    A file this build cannot read counts as absent rather than propagating:
    there is nothing a person can do about it, the offer to mint a fresh one
    is the only useful thing the screen can say, and confirming a fresh one
    overwrites the unreadable file.

    Both slots holding the same wrap is a promotion cut between its write
    and its removal. That is a finished replacement, so it reads as one and
    the leftover pending file is removed here when the credentials are free. */
export async function recoveryKeyState(
  ports: RecoveryKeyPorts = filePorts
): Promise<{ active: boolean; pending: boolean }> {
  const active = await readReadable(ports.active);
  const pending = await readReadable(ports.pending);
  if (active !== null && pending !== null && sameWrap(active, pending)) {
    const tidy = () =>
      changeCredentials(async () => {
        const [nowActive, nowPending] = [await readReadable(ports.active), await readReadable(ports.pending)];
        if (nowActive !== null && nowPending !== null && sameWrap(nowActive, nowPending)) await ports.pending.remove();
      });
    await tidy().catch((error) => {
      /* Busy is a boot or another change owning the files right now: tidy
         once it lets go, without holding this answer up for it. Any other
         failure leaves a harmless duplicate for the next read. */
      if (error instanceof CredentialsBusyError) {
        void authenticateCredentials(async () => {}).then(tidy).catch(() => {});
      } else {
        console.warn('could not tidy a confirmed recovery key', error);
      }
    });
    return { active: true, pending: false };
  }
  return { active: active !== null, pending: pending !== null };
}

/** Drops a pending key, leaving the active one, if any, as it was: "keep
    the old key", and the first step of making another. Tolerates absence. */
export async function discardPendingRecoveryKey(ports: RecoveryKeyPorts = filePorts): Promise<void> {
  return changeCredentials(() => discardPendingRecoveryKeyOwned(ports));
}

/** The same, for a credential change that already owns the credentials: a
    changed passphrase, PIN or access mode discards a key nobody confirmed,
    so a pending key never outlives the protection it was made under. */
export async function discardPendingRecoveryKeyOwned(ports: RecoveryKeyPorts = filePorts): Promise<void> {
  await ports.pending.remove();
}

/** Removes the recovery key, and a pending one with it. Tolerates their
    absence, because the caller's goal is that they are gone.

    The pending key goes first: a cut between the two leaves the confirmed
    key still active, which the screen then says, rather than a key nobody
    confirmed as the only one left.

    Immediate, and this comment used to say the opposite. The file is what
    the key opens; once it is gone the written characters open nothing, on
    the next boot and on this one. What is unaffected is the session already
    running, which holds the data key in memory and consults neither file
    again - which is a different sentence, and not the one somebody deciding
    whether to revoke is asking. */
export async function revokeRecoveryKey(ports: RecoveryKeyPorts = filePorts): Promise<void> {
  return changeCredentials(async () => {
    await ports.pending.remove();
    await ports.active.remove();
  });
}

/** An in-memory store, for tests and for the Node tier where OPFS does not
    exist. Exported from the module it belongs to rather than a test-support
    file, because it is a few lines and its shape has to track the ports
    interface directly above it. */
export function inMemoryRecoveryKeyPorts(): RecoveryKeyPorts {
  /* Held as the serialized text rather than the object, so that a test
     exercising mint-then-open goes through the same encode and decode a
     real boot does. A wrap that round-trips in memory but not through the
     file would otherwise pass every test here. */
  const slot = (): RecoveryWrapSlot => {
    let stored: string | null = null;
    return {
      read: async () => (stored === null ? null : parseRecoveryWrap(stored)),
      write: async (wrap) => {
        stored = serializeRecoveryWrap(wrap);
      },
      remove: async () => {
        stored = null;
      }
    };
  };
  return { active: slot(), pending: slot() };
}
