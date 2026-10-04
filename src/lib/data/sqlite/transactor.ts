import type { SqliteDriver, SqliteReader } from './driver.ts';
/* Raw transaction statements stay serialized. The public wrapper below also
   keeps unrelated calls outside each transaction or read snapshot. */

export interface TransactionSteps {
  begin(): Promise<void>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
}

/** Serializes BEGIN, callback and COMMIT or ROLLBACK on the raw connection. */
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


type RawSqliteDriver = Omit<SqliteDriver, 'readSnapshot' | 'transaction'> & {
  transaction<T>(work: () => T | Promise<T>): Promise<T>;
};

/** Reserves the connection for transaction and snapshot callbacks.
    Ordinary calls stay pipelined while no reservation is pending. */
export function withReadSnapshots(driver: RawSqliteDriver): SqliteDriver {
  let active = 0;
  let idle: (() => void)[] = [];
  let blocked: Promise<void> | null = null;
  let reservations: Promise<unknown> = Promise.resolve();

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

  function reserve<T>(work: () => T | Promise<T>): Promise<T> {
    let release!: () => void;
    const barrier = new Promise<void>((resolve) => { release = resolve; });
    blocked = barrier;
    const result = reservations.then(async () => {
      while (active > 0) await new Promise<void>((resolve) => idle.push(resolve));
      return work();
    }).finally(() => {
      if (blocked === barrier) blocked = null;
      release();
    });
    reservations = result.catch(() => {});
    return result;
  }

  function transaction<T>(work: (scope: SqliteDriver) => T | Promise<T>): Promise<T> {
    const cleanups: (() => Promise<void>)[] = [];
    const writing = reserve(() => driver.transaction(async () => {
      let valid = true;
      function use<Result>(operation: () => Result): Result {
        if (!valid) throw new Error('transaction scope has expired');
        return operation();
      }
      const scope: SqliteDriver = {
        exec: (sql) => use(() => driver.exec(sql)),
        query: async <Row extends Record<string, unknown>>(sql: string, params?: unknown[]) =>
          use(() => driver.query<Row>(sql, params)),
        run: async (sql, params) => use(() => driver.run(sql, params)),
        getUserVersion: () => use(() => driver.getUserVersion()),
        setUserVersion: (version) => use(() => driver.setUserVersion(version)),
        deferUntilCommit: (cleanup) => use(() => { cleanups.push(cleanup); }),
        transaction: async () => use(() => { throw new Error('nested transactions are not supported'); }),
        readSnapshot: async () => use(() => { throw new Error('read snapshots cannot start inside a transaction'); }),
        close: async () => use(() => { throw new Error('a transaction scope cannot close the connection'); })
      };
      try {
        return await work(scope);
      } finally {
        valid = false;
      }
    }));
    return writing.then(async (value) => {
      for (const cleanup of cleanups) await cleanup();
      return value;
    });
  }

  function readSnapshot<T>(read: (reader: SqliteReader) => Promise<T>): Promise<T> {
    return reserve(async () => {
      let valid = true;
      const reader: SqliteReader = {
        async query<Row extends Record<string, unknown>>(sql: string, params?: unknown[]) {
          if (!valid) throw new Error('snapshot scope has expired');
          return driver.query<Row>(sql, params);
        }
      };
      try {
        return await read(reader);
      } finally {
        valid = false;
      }
    });
  }

  return {
    exec: (sql) => call(() => driver.exec(sql)),
    query: <Row extends Record<string, unknown>>(sql: string, params?: unknown[]) =>
      Promise.resolve(call(() => driver.query<Row>(sql, params))),
    run: (sql, params) => Promise.resolve(call(() => driver.run(sql, params))),
    getUserVersion: () => call(() => driver.getUserVersion()),
    setUserVersion: (version) => call(() => driver.setUserVersion(version)),
    transaction,
    close: () => Promise.resolve(call(() => driver.close())),
    readSnapshot
  };
}

/** A scoped caller must keep bytes until its outer transaction commits. */
export async function afterCommit(driver: SqliteDriver, cleanup: () => Promise<void>): Promise<void> {
  if (driver.deferUntilCommit) driver.deferUntilCommit(cleanup);
  else await cleanup();
}
