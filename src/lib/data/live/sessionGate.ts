/* What the open journal and its data key are handed out through, so that a
   lock can take both away (after-release ticket 10).

   Before this, each was a value set once per page and a promise resolved
   once beside it: fine while a journal stayed open until the tab closed,
   and the reason a lock on the web could only hide the screen. A lock now
   closes the database and lets go of the key, and that needs three things
   neither shape had:

     - calls made while nothing is open wait, and run against whatever opens
       next rather than against what was open before;
     - a lock waits for every call already running to settle before the
       database under it closes, so a save in flight lands rather than being
       cut off by the close;
     - after the lock, nothing in here still holds the old value.

   Rune-free so the Node tier reaches it. live/journal.svelte.ts puts its
   facade behind one of these and boot.svelte.ts keeps the data key in
   another. */

export interface SessionGate<T> {
  /** What is open now, or null while locked or still booting. */
  readonly current: T | null;
  /** Runs `use` on what is open now, or on the next thing to open. Counted
      as in flight from the moment it starts until it settles. `use` must not
      wait on this same gate: once a close has begun, that inner call waits
      for the reopen and the close waits for `use`. The journal facade's
      callbacks only call the raw journal, which never comes back here. */
  run<R>(use: (value: T) => R | Promise<R>): Promise<R>;
  /** What is open now, or the next thing to open. Not counted: a caller
      that waits on this holds nothing open. */
  next(): Promise<T>;
  /** Hands `value` out from now on, and starts every call that was waiting,
      in the order they were made. */
  open(value: T): void;
  /** Stops handing anything out, and resolves once every call already
      started has settled. A call made from here on waits for the next
      open. */
  close(): Promise<void>;
}

export function sessionGate<T>(): SessionGate<T> {
  let current: T | null = null;
  /* Started synchronously inside open() rather than off a promise: a promise
     would start them a microtask later, and a lock that began in between
     would close the gate under calls that had not been counted yet. */
  let waiting: ((value: T) => void)[] = [];
  const inFlight = new Set<Promise<void>>();

  function start<R>(use: (value: T) => R | Promise<R>, value: T): Promise<R> {
    let running: Promise<R>;
    try {
      running = Promise.resolve(use(value));
    } catch (error) {
      running = Promise.reject(error);
    }
    const settled = running.then(
      () => {},
      () => {}
    );
    inFlight.add(settled);
    void settled.then(() => inFlight.delete(settled));
    return running;
  }

  return {
    get current() {
      return current;
    },
    run(use) {
      if (current !== null) return start(use, current);
      return new Promise((resolve, reject) => {
        waiting.push((value) => start(use, value).then(resolve, reject));
      });
    },
    next() {
      if (current !== null) return Promise.resolve(current);
      return new Promise((resolve) => waiting.push(resolve));
    },
    open(value) {
      current = value;
      const ready = waiting;
      waiting = [];
      for (const go of ready) go(value);
    },
    async close() {
      current = null;
      /* Looped: a call that settles can start another before this wakes,
         and that one is running against the same database. */
      while (inFlight.size > 0) await Promise.all([...inFlight]);
    }
  };
}
