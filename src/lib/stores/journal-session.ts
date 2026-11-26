/* Suspend the open web journal during a lock. Wait for in-flight work and
   preference writes, close the worker and release the app's references to
   the key and journal content. Existing saves need their original key until
   they finish. JavaScript leaves key bytes to garbage collection. SECURITY.md
   describes the limits.

   Unlock derives the key from the current access mode and reopens the
   journal. boot.svelte.ts supplies suspend, open, release and keyless worker
   prewarm ports so the Node tier can test this logic. Android uses its native
   lock path. */

import { unlockAttempts, UnlockCancelledError } from '../lock/unlock-attempt.ts';
import { sessionGate, type SessionGate } from '../data/live/sessionGate.ts';

interface Closable {
  close(): Promise<void>;
  dispose?(): void;
}

export interface JournalSessionPorts<Key, Driver extends Closable> {
  suspend(): Promise<void>;
  /** Register the private driver before any wait. Check ownership after
      waits, before publishing access. The session owns failure cleanup. */
  open(key: Key, current: () => void, own: (driver: Driver) => void): Promise<Driver>;
  release(retainContent: boolean): void;
  prewarm(): void;
}

export interface JournalSession<Key, Driver extends Closable> {
  /** The data key, for as long as the journal is open. */
  readonly key: SessionGate<Key>;
  /** The open database, for the journal's own calls into it. A journal
      handle is built over this gate rather than over one driver
      (data/live/sessionDriver.ts), so a call that comes after a lock -
      from a save that was still encrypting a photo when the lock gave up
      waiting for it - waits for the reopened database instead of reaching
      the worker the lock terminated. The lock drains it before closing. */
  readonly connection: SessionGate<Driver>;
  /** The open database, or null while locked or suspended for navigation. */
  readonly driver: Driver | null;
  /** Closed by a lock or retained navigation and not reopened yet. */
  readonly locked: boolean;
  /** The first open, which boot does itself. Opens `connection` too, which
      boot has already done as soon as the driver existed, because the
      boot's own journal calls go through it; here for callers that do not. */
  adopt(key: Key, driver: Driver): void;
  lock(): Promise<void>;
  /** Close a retained document's gates and worker, without inventing a lock.
      A later lock discards the key retained for this return. */
  suspendForNavigation(retainKey: boolean): Promise<void>;
  resumeAfterNavigation(current: () => void): Promise<void>;
  /** Reopens a journal a lock closed, under the key just derived. Does
      nothing if no lock closed it. Rejects, still locked, if it cannot. */
  unlock(key: Key, current?: () => void): Promise<void>;
}

/** How long a lock waits for the calls already running before it closes the
    database anyway. A call into a worker that has stopped answering would
    otherwise hold the key in the page for good; closing terminates the
    worker, which rejects that call. Saves take milliseconds, so this is a
    bound on a fault rather than on anything a person does. */
const SUSPEND_LIMIT_MS = 5000;

export function journalSession<Key, Driver extends Closable>(
  ports: JournalSessionPorts<Key, Driver>,
  { suspendLimitMs = SUSPEND_LIMIT_MS }: { suspendLimitMs?: number } = {}
): JournalSession<Key, Driver> {
  const attempts = unlockAttempts();
  const key = sessionGate<Key>();
  const connection = sessionGate<Driver>();
  let driver: Driver | null = null;
  let locked = false;
  let retainedNavigation: { key: Key } | null = null;
  let navigationSuspended = false;
  /* An unlock asked for while a lock is still waiting on the journal's
     calls ends that wait. The wait is there so a save can land before the
     database closes; with the person back, the database is about to reopen
     and the save lands there instead, so keeping them on "Decrypting..."
     until the limit would buy nothing. A database call already running
     still finishes first: the drain of `connection` is not cut short. */
  let unlockWaiting = false;
  let stopWaiting: (() => void) | null = null;
  let cancelOpening: (() => void) | null = null;
  /* One at a time, in the order asked. Someone who comes straight back
     unlocks while the lock is still waiting for a save, and someone who
     leaves again under `immediately` locks while the unlock is reopening;
     either way the second waits for the first to finish. A newer lock
     cancels the pending unlock before it can publish access. */
  let turn: Promise<void> = Promise.resolve();
  const inTurn = (step: () => Promise<void>): Promise<void> => {
    const mine = turn.then(step);
    turn = mine.catch(() => {});
    return mine;
  };

  async function close(closing: Driver, interruptible: boolean, suspended?: Promise<void>) {
    /* Fails closed: whatever suspending did or did not finish, the
       database closes and the key goes. A lock that stopped here would
       leave the gate drawn over a journal still open behind it. */
    let limit: ReturnType<typeof setTimeout> | undefined;
    const outOfTime = new Promise<void>((resolve) => {
      limit = setTimeout(() => {
        console.warn(`the journal was still busy ${suspendLimitMs} ms into the lock; closing it anyway`);
        resolve();
      }, suspendLimitMs);
    });
    await Promise.race([
      (suspended ?? ports.suspend()).catch((error) => {
        console.warn('the journal did not settle cleanly before the lock', error);
      }),
      outOfTime,
      ...(interruptible ? [new Promise<void>((resolve) => {
        stopWaiting = resolve;
        if (unlockWaiting) resolve();
      })] : [])
    ]);
    stopWaiting = null;
    /* Whatever the journal's calls are doing now, the ones that come
       to the database from here wait for the reopen. The ones already
       in the worker get the rest of the same limit to answer. */
    await Promise.race([connection.close(), outOfTime]);
    /* A worker that already died has nothing left to close, and the
       key still has to go. */
    const closed = closing.close().catch((error) => {
      console.warn('the journal database was already closed at the lock', error);
    });
    // Only platforms that own synchronous disposal can bound their close.
    // Android uses its native lock path, not this web session lifecycle.
    if (closing.dispose) {
      await Promise.race([closed, outOfTime]);
      closing.dispose();
    } else await closed;
    clearTimeout(limit);
    driver = null;
    locked = true;
    void key.close();
    ports.release(retainedNavigation !== null);
    if (!suspended && !navigationSuspended) ports.prewarm();
  }

  return {
    key,
    connection,
    get driver() {
      return driver;
    },
    get locked() {
      return locked;
    },
    adopt(opened, openDriver) {
      key.open(opened);
      connection.open(openDriver);
      driver = openDriver;
      locked = false;
    },
    lock: () => {
      attempts.lock();
      cancelOpening?.();
      retainedNavigation = null;
      // Revoke new key access immediately; existing saves keep their key.
      void key.close();
      return inTurn(async () => {
        const closing = driver;
        if (closing === null) return;
        await close(closing, true);
      });
    },
    suspendForNavigation(retainKey) {
      navigationSuspended = true;
      attempts.lock();
      cancelOpening?.();
      const held = retainedNavigation?.key ?? key.current;
      // Each suspension owns its retained key, even when the key bytes are the same.
      retainedNavigation = retainKey && held !== null ? { key: held } : null;
      // Stop handing out handles in the pagehide turn, before freezing.
      const suspended = ports.suspend().catch((error) => {
        console.warn('the journal did not settle cleanly before retained navigation', error);
      });
      void connection.close();
      void key.close();
      return inTurn(async () => {
        const closing = driver;
        if (closing !== null) await close(closing, false, suspended);
        // A cancelled private open has already completed bounded disposal.
        // Its remaining saves may need the next unlock, so do not drain again.
      });
    },
    async resumeAfterNavigation(current) {
      const retained = retainedNavigation;
      if (retained === null) return;
      try {
        await this.unlock(retained.key, () => {
          current();
          if (retainedNavigation !== retained) throw new Error('the retained journal session was locked');
        });
      } finally {
        if (retainedNavigation === retained) retainedNavigation = null;
      }
    },
    unlock(derived, current = () => {}) {
      const owned = attempts.begin();
      const check = () => {
        owned();
        current();
      };
      unlockWaiting = true;
      stopWaiting?.();
      return inTurn(async () => {
        unlockWaiting = false;
        check();
        if (!locked) return;
        let opening: Driver | null = null;
        let cancel!: () => void;
        const cancelled = new Promise<never>((_resolve, reject) => {
          cancel = () => reject(new UnlockCancelledError());
        });
        cancelOpening = cancel;
        try {
          const opened = await Promise.race([
            ports.open(derived, check, (privateDriver) => { opening = privateDriver; }),
            cancelled
          ]);
          check();
          driver = opened;
          connection.open(driver);
          locked = false;
          key.open(derived);
          navigationSuspended = false;
          retainedNavigation = null;
        } catch (error) {
          // Disposal cannot wait for preparation to return its driver.
          // Late preparation has only its ownership check, not a cleanup
          // callback that could clear a subsequently opened session.
          if (opening !== null) await close(opening, false);
          throw error;
        } finally {
          if (cancelOpening === cancel) cancelOpening = null;
        }
      });
    }
  };
}
