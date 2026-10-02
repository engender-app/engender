import type { SqliteDriver, SqliteReader } from './driver.ts';
/* One transaction at a time over one connection (ticket 134).

   All three drivers hold a single SQLite connection and implement
   `transaction()` as manual BEGIN/COMMIT/ROLLBACK around a callback that
   the caller awaits. That composes with each driver's own call ordering,
   but it does not compose with a *second* transaction: SQLite has no
   nested transactions, so a BEGIN arriving while one is open fails with
   "cannot start a transaction within a transaction" - and then that
   caller's error path sends a ROLLBACK, which takes back the work of the
   transaction that was legitimately open. A page error and a silently
   lost commit, from two writes that merely overlapped.

   Overlapping writes are ordinary here rather than exotic: journal-busy.ts
   counts them precisely because "an entry save and the photo store's write
   land on their own schedules", and boot's housekeeping passes run with the
   screens already live. The drivers' own comments used to say nothing
   issued journal work concurrently with a transaction; that was never
   something the code enforced.

   So the invariant belongs to the driver, once, rather than to whichever
   callers happen not to overlap: transactions queue behind each other and
   each one's BEGIN is sent only after the previous COMMIT or ROLLBACK.

   What this deliberately does not do is isolate a transaction from
   everything else. A plain query or write made while one is open still
   lands inside it, on every platform, because there is one connection and
   the callback's own statements have to reach it. That exposure is the
   same as it was; what is removed is the collision that made two
   transactions fight over the same BEGIN.

   The constraint that comes with a queue, and the reason to read it before
   writing a transaction body: a callback must not open a transaction of
   its own. Nothing does today - reconcile.ts and restore.ts both carry a
   second entry point rather than nest, and say so - but where nesting used
   to fail loudly on SQLite's own "within a transaction", it would now wait
   behind the very call it is inside, forever and without an error. Nothing
   here can tell that apart from an ordinary second caller, which is the
   whole reason it cannot be caught: the queue sees two calls, not who made
   them. So the rule is the caller's to keep. */

export interface TransactionSteps {
  begin(): Promise<void>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
}

/** Wraps a connection's three transaction statements into the
    `SqliteDriver['transaction']` a driver exposes, serialized. */
export function oneTransactionAtATime(
  steps: TransactionSteps
): <T>(fn: () => T | Promise<T>) => Promise<T> {
  let tail: Promise<unknown> = Promise.resolve();

  return function transaction<T>(fn: () => T | Promise<T>): Promise<T> {
    const result = tail.then(async () => {
      /* Outside the try on purpose: a BEGIN that failed opened nothing, and
         a ROLLBACK sent for it would take back whatever the connection did
         have open instead. */
      await steps.begin();
      try {
        const value = await fn();
        await steps.commit();
        return value;
      } catch (error) {
        await steps.rollback();
        throw error;
      }
    });
    /* The queue must not carry a rejection forward, or one failed
       transaction fails every later one. The caller still sees its own. */
    tail = result.catch(() => {});
    return result;
  };
}


/** Keep multi-query reads separate from other calls on this connection.
    Ordinary calls still start immediately and preserve platform pipelining. */
export function withReadSnapshots(driver: Omit<SqliteDriver, 'readSnapshot'>): SqliteDriver {
  let active = 0;
  let idle: (() => void)[] = [];
  let blocked: Promise<void> | null = null;
  let snapshots: Promise<unknown> = Promise.resolve();

  function finished() {
    if (--active === 0) {
      const waiting = idle;
      idle = [];
      for (const resolve of waiting) resolve();
    }
  }

  function call<T>(work: () => T | Promise<T>): T | Promise<T> {
    if (blocked) return blocked.then(() => call(work));
    active++;
    try {
      const result = work();
      if (result instanceof Promise) return result.finally(finished);
      finished();
      return result;
    } catch (error) {
      finished();
      throw error;
    }
  }

  function readSnapshot<T>(read: (reader: SqliteReader) => Promise<T>): Promise<T> {
    const result = snapshots.then(async () => {
      // Existing transactions must finish, including their callback's calls.
      // Blocking before they finish would deadlock those callbacks.
      while (active > 0) await new Promise<void>((resolve) => idle.push(resolve));
      let release!: () => void;
      blocked = new Promise<void>((resolve) => { release = resolve; });
      try {
        return await read({ query: driver.query.bind(driver) });
      } finally {
        blocked = null;
        release();
      }
    });
    snapshots = result.catch(() => {});
    return result;
  }

  return {
    exec: (sql) => call(() => driver.exec(sql)),
    query: <Row extends Record<string, unknown>>(sql: string, params?: unknown[]) =>
      Promise.resolve(call(() => driver.query<Row>(sql, params))),
    run: (sql, params) => Promise.resolve(call(() => driver.run(sql, params))),
    getUserVersion: () => call(() => driver.getUserVersion()),
    setUserVersion: (version) => call(() => driver.setUserVersion(version)),
    transaction: <T>(work: () => T | Promise<T>) => call(() => driver.transaction(work)),
    close: () => Promise.resolve(call(() => driver.close())),
    readSnapshot
  };
}
