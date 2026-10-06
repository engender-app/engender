/* A driver that is whichever database is open when a call is made, rather
   than the one that was open when the journal over it was built.

   A journal handle captures its driver once, in openJournal's closures, and
   a write can hold that handle for as long as it likes: a save encrypts its
   photos to storage before it opens its transaction, and that can outlast a
   lock's wait for it. Built over one driver, the save then reached the
   worker the lock had terminated, and failed after the unlock with "the
   database worker was closed" - the entry was lost while the editor had
   already let it go. Built over this, its transaction waits for the
   reopened database and lands there, under the same key.

   Each call is counted by the gate while it runs, so a lock waits for the
   ones already in the worker before closing it (journal-session.ts). A
   transaction or snapshot is one call: what runs inside it uses the scope
   it is handed, which belongs to the driver the call started on. */

import type { SqliteDriver } from '../sqlite/driver.ts';
import type { SessionGate } from './sessionGate.ts';

export function sessionDriver(open: SessionGate<SqliteDriver>): SqliteDriver {
  return {
    exec: (sql) => open.run((driver) => driver.exec(sql)),
    query: (sql, params) => open.run((driver) => driver.query(sql, params)),
    run: (sql, params) => open.run((driver) => driver.run(sql, params)),
    getUserVersion: () => open.run((driver) => driver.getUserVersion()),
    setUserVersion: (version) => open.run((driver) => driver.setUserVersion(version)),
    transaction: (work) => open.run((driver) => driver.transaction(work)),
    readSnapshot: (read) => open.run((driver) => driver.readSnapshot(read)),
    /* The session closes the database it opened; a journal never does. */
    close: () => Promise.reject(new Error('the journal session closes its own database'))
  };
}
