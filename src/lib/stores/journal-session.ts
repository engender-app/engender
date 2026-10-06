/* What a mid-session lock does to an open web journal, and what unlocking
   undoes (after-release ticket 10, the confirmed decision in pre-release
   human 03, item 11).

   A lock used to hide the screen and nothing else: the database stayed open
   and the data key stayed in this page, so anybody at a locked tab who
   opened devtools could still query the journal. Now, in a lockable web
   mode, a lock lets every call already running finish, closes the database
   worker, and drops the references this app keeps to the key. Unlocking
   derives the key the way it always did, from the access mode's own
   secret, and opens the journal again under it.

   What "drops the references" can and cannot mean is said once, here and
   in SECURITY.md: JavaScript has no way to overwrite memory on demand. The
   key's bytes become garbage for the engine to collect whenever it chooses,
   and the worker that held the database's copy is terminated. Nothing here
   overwrites the bytes either, on purpose - a save that was already
   encrypting under them when the lock arrived must still finish with the
   key it started with.

   Rune-free so the Node tier reaches it. The parts that are runes or
   workers arrive as ports from boot.svelte.ts:

     - `suspend` stops the journal facade handing anything out and resolves
       once what it already handed out has settled (sessionGate.ts), and
       flushes the preference writes in flight;
     - `open` builds a driver and a journal over the key and resolves once
       the database has answered;
     - `release` lets go of everything else built over the key - the photo
       stores, the driver's file operations - and the journal content held
       in memory outside the database;
     - `prewarm` starts a keyless worker for the next unlock, so the reopen
       costs one `open` rather than a worker start as well.

   Android's lock is out of scope and does not come through here: its
   database lives behind a native plugin with a lock path of its own. */

import { sessionGate, type SessionGate } from '../data/live/sessionGate.ts';

interface Closable {
  close(): Promise<void>;
}

export interface JournalSessionPorts<Key, Driver extends Closable> {
  suspend(): Promise<void>;
  open(key: Key): Promise<Driver>;
  release(): void;
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
  /** The open database, or null while locked. */
  readonly driver: Driver | null;
  /** Closed by a lock and not reopened yet. */
  readonly locked: boolean;
  /** The first open, which boot does itself. Boot opens `connection` on
      the driver earlier than this, as soon as it exists, because the boot's
      own journal calls go through it. */
  adopt(key: Key, driver: Driver): void;
  lock(): Promise<void>;
  /** Reopens a journal a lock closed, under the key just derived. Does
      nothing if no lock closed it. Rejects, still locked, if it cannot. */
  unlock(key: Key): Promise<void>;
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
  const key = sessionGate<Key>();
  const connection = sessionGate<Driver>();
  let driver: Driver | null = null;
  let locked = false;
  /* An unlock asked for while a lock is still waiting on the journal's
     calls ends that wait. The wait is there so a save can land before the
     database closes; with the person back, the database is about to reopen
     and the save lands there instead, so keeping them on "Decrypting..."
     until the limit would buy nothing. A database call already running
     still finishes first: the drain of `connection` is not cut short. */
  let unlockWaiting = false;
  let stopWaiting: (() => void) | null = null;
  /* One at a time, in the order asked. Someone who comes straight back
     unlocks while the lock is still waiting for a save, and someone who
     leaves again under `immediately` locks while the unlock is reopening;
     either way the second waits for the first to finish. */
  let turn: Promise<void> = Promise.resolve();
  const inTurn = (step: () => Promise<void>): Promise<void> => {
    const mine = turn.then(step);
    turn = mine.catch(() => {});
    return mine;
  };

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
    lock: () =>
      inTurn(async () => {
        const closing = driver;
        if (closing === null) return;
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
          ports.suspend().catch((error) => {
            console.warn('the journal did not settle cleanly before the lock', error);
          }),
          outOfTime,
          new Promise<void>((resolve) => {
            stopWaiting = resolve;
            if (unlockWaiting) resolve();
          })
        ]);
        stopWaiting = null;
        /* Whatever the journal's calls are doing now, the ones that come
           to the database from here wait for the reopen. The ones already
           in the worker get the rest of the same limit to answer. */
        await Promise.race([connection.close(), outOfTime]);
        clearTimeout(limit);
        /* A worker that already died has nothing left to close, and the
           key still has to go. */
        await closing.close().catch((error) => {
          console.warn('the journal database was already closed at the lock', error);
        });
        driver = null;
        locked = true;
        await key.close();
        ports.release();
        ports.prewarm();
      }),
    unlock(derived) {
      unlockWaiting = true;
      stopWaiting?.();
      return inTurn(async () => {
        unlockWaiting = false;
        if (!locked) return;
        driver = await ports.open(derived);
        connection.open(driver);
        locked = false;
        key.open(derived);
      });
    }
  };
}
