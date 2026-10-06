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
  /** The open database, or null while locked. */
  readonly driver: Driver | null;
  /** Closed by a lock and not reopened yet. */
  readonly locked: boolean;
  /** The first open, which boot does itself. */
  adopt(key: Key, driver: Driver): void;
  lock(): Promise<void>;
  /** Reopens a journal a lock closed, under the key just derived. Does
      nothing if no lock closed it. Rejects, still locked, if it cannot. */
  unlock(key: Key): Promise<void>;
}

export function journalSession<Key, Driver extends Closable>(
  ports: JournalSessionPorts<Key, Driver>
): JournalSession<Key, Driver> {
  const key = sessionGate<Key>();
  let driver: Driver | null = null;
  let locked = false;
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
    get driver() {
      return driver;
    },
    get locked() {
      return locked;
    },
    adopt(opened, openDriver) {
      key.open(opened);
      driver = openDriver;
      locked = false;
    },
    lock: () =>
      inTurn(async () => {
        const closing = driver;
        if (closing === null) return;
        await ports.suspend();
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
    unlock: (derived) =>
      inTurn(async () => {
        if (!locked) return;
        driver = await ports.open(derived);
        locked = false;
        key.open(derived);
      })
  };
}
