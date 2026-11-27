/* Gate access to the journal and data key. Calls wait for the next open
   when the gate has no value. A lock waits for active work before closing
   and releasing the old value.

   end() closes the session to new commands until unlock. Reads may wait.
   Startup and temporary closes for navigation or reopen still allow
   commands to queue. Keep this module rune-free for Node tests. */

/** A command made after a lock ended the session it belonged to. */
export class SessionClosedError extends Error {
  constructor() {
    super('the journal was locked before this change was made, so it was not made');
    this.name = 'SessionClosedError';
  }
}

export interface RunOptions {
  /** The call changes the journal: refused, not queued, after a lock. */
  command?: boolean;
}

export interface SessionGate<T> {
  /** What is open now, or null while locked or still booting. */
  readonly current: T | null;
  /** Runs `use` on what is open now, or on the next thing to open. Counted
      as in flight from the moment it starts until it settles. `use` must not
      wait on this same gate: once a close has begun, that inner call waits
      for the reopen and the close waits for `use`. The journal facade's
      callbacks only call the raw journal, which never comes back here. */
  run<R>(use: (value: T) => R | Promise<R>, options?: RunOptions): Promise<R>;
  /** What is open now, or the next thing to open. Not counted: a caller
      that waits on this holds nothing open. */
  next(): Promise<T>;
  /** Hands `value` out from now on, and starts every call that was waiting,
      in the order they were made. */
  open(value: T): void;
  /** A lock: stops handing anything out at once, and refuses commands until
      the next open. `close` still does the draining. */
  end(): void;
  /** Stops handing anything out, and resolves once every call already
      started has settled. A call made from here on waits for the next
      open. */
  close(): Promise<void>;
}

export function sessionGate<T>(): SessionGate<T> {
  let current: T | null = null;
  /** A lock ended the last session and nothing has opened since. */
  let ended = false;
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
    run(use, { command = false } = {}) {
      if (current !== null) return start(use, current);
      if (command && ended) return Promise.reject(new SessionClosedError());
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
      ended = false;
      const ready = waiting;
      waiting = [];
      for (const go of ready) go(value);
    },
    end() {
      current = null;
      ended = true;
    },
    async close() {
      current = null;
      /* Looped: a call that settles can start another before this wakes,
         and that one is running against the same database. */
      while (inFlight.size > 0) await Promise.all([...inFlight]);
    }
  };
}
