/* Persist the recovery wrap separately from the access keystore
   (ADR-0054). Boot uses keystore `secretSource` to choose a gate;
   a recovery wrap has a single secret kind and does not select a mode.

   Revocation touches only this file. Mode changes rewrap the same
   data key in the keystore, so they preserve recovery access. */

import { unwrapDataKey, wrapDataKey, type DataKeyWrap } from './keystore.ts';
import { resolveCredentialProfile } from './credential-consumers.ts';
import { parseWrap, toBase64 } from './wrapEncoding.ts';

const RECOVERY_WRAP_VERSION = 1;

export interface RecoveryWrap extends DataKeyWrap {
  version: typeof RECOVERY_WRAP_VERSION;
}

/** Thrown for a recovery file this build cannot read - a newer format
    version, or a file that is not a recovery wrap at all. Distinct from
    DecryptionFailedError and from RecoveryKeyMistypedError: this one is
    neither a wrong key nor a typo, and no amount of retyping fixes it. */
export class RecoveryWrapUnreadableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RecoveryWrapUnreadableError';
  }
}

/** Seals the data key under an already-canonical recovery key. Takes the
    canonical string rather than what somebody typed, so that a caller
    cannot skip the check symbol by handing raw input to the KDF. */
export async function wrapDataKeyWithRecoveryKey(
  dataKey: Uint8Array<ArrayBuffer>,
  canonicalKey: string
): Promise<RecoveryWrap> {
  const params = resolveCredentialProfile('journal-recovery-add');
  return { version: RECOVERY_WRAP_VERSION, ...(await wrapDataKey(dataKey, canonicalKey, params)) };
}

/** Recovers the data key, or throws DecryptionFailedError for a key that
    is well formed and simply not this journal's. */
export async function unwrapDataKeyWithRecoveryKey(
  wrap: RecoveryWrap,
  canonicalKey: string
): Promise<Uint8Array<ArrayBuffer>> {
  /* Resolved and discarded, exactly as `unlockKeystore` does it: the row
     selects persisted parameters so no bytes change, and what the call
     buys is that the registry has to carry an unlock row for this profile
     or the derivation refuses to happen at all. */
  resolveCredentialProfile('journal-recovery-unlock', { persistedParams: wrap.params });
  return unwrapDataKey(wrap, canonicalKey);
}

export function serializeRecoveryWrap(wrap: RecoveryWrap): string {
  return JSON.stringify({
    version: wrap.version,
    kdf: wrap.kdf,
    params: wrap.params,
    salt: toBase64(wrap.salt),
    nonce: toBase64(wrap.nonce),
    wrappedKey: toBase64(wrap.wrappedKey)
  });
}

export function parseRecoveryWrap(serialized: string): RecoveryWrap {
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(serialized) as Record<string, unknown>;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error();
  } catch {
    throw new RecoveryWrapUnreadableError('the recovery file is not JSON');
  }
  if (raw.version !== RECOVERY_WRAP_VERSION) {
    throw new RecoveryWrapUnreadableError(
      `recovery file version ${String(raw.version)} is not one this build reads`
    );
  }
  return {
    version: RECOVERY_WRAP_VERSION,
    ...parseWrap(raw, 'the recovery file', RecoveryWrapUnreadableError)
  };
}
