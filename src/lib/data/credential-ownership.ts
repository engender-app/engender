import { isAndroid } from '../platform';

// Keep the setup lock name so existing setup clients share this boundary.
const LOCK_NAME = 'engender-journal-initialization';
let nativeTurn: Promise<void> = Promise.resolve();
let nativePending = 0;

export class CredentialsBusyError extends Error {
  constructor() {
    super('another journal credential operation is still running');
    this.name = 'CredentialsBusyError';
  }
}

async function ownCredentials<T>(work: () => Promise<T>, wait: boolean): Promise<T> {
  if (isAndroid()) {
    if (!wait && nativePending > 0) return Promise.reject(new CredentialsBusyError());
    nativePending++;
    const pending = nativeTurn.then(work).finally(() => { nativePending--; });
    // The queue keeps completion only, never an authentication result or key.
    nativeTurn = pending.then(() => {}, () => {});
    return pending;
  }
  return await navigator.locks.request(LOCK_NAME, { ifAvailable: !wait }, (lock) => {
    if (!lock) throw new CredentialsBusyError();
    return work();
  });
}

/** Setup waits, then rechecks durable state before creating anything. */
export function initializeCredentials<T>(work: () => Promise<T>): Promise<T> {
  return ownCredentials(work, true);
}

/** Authentication waits for the current owner, then reads its committed state.
    PIN unlock may rebind an older wrap, so it owns that whole operation too. */
export function authenticateCredentials<T>(work: () => Promise<T>): Promise<T> {
  return ownCredentials(work, true);
}

/** Own the complete mutation, including old-binding cleanup. Reject overlap
    rather than queue a change captured by a page that may lock or reset.
    Low-level wrap and binding helpers run inside this boundary, never nest it. */
export async function changeCredentials<T>(work: () => Promise<T>): Promise<T> {
  return ownCredentials(work, false);
}
