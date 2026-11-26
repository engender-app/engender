/* Resolve the active driver per call. A save can prepare photos
   through a lock and then wait for the reopened journal to start its
   transaction. journal-session.ts holds each in-flight call until
   it finishes before closing the driver. Transactions and snapshots
   count once and use the scope they were given throughout. */

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
