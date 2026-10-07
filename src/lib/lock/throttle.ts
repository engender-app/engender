/* The growing delay after wrong PIN attempts (ADR-0014). Deliberately not
   an attempt limit: nothing here ever wipes anything, because the only way
   to lose the journal has to be one the user chose (the reset action on
   the lock screen), not one a bored kid can trip into.

   Epoch time labels a pending wait but cannot prove that it was paid.
   A reload owes the full delay unless a monotonic mirror can prove what
   remains. performance.now() measures elapsed time within the session.

   The count outlives the page, through the injected store. In memory it
   would not have raised the cost of guessing at all: the guesser is
   holding the device the lock screen is on, and reloading it is a gesture
   away. What no store can defend against is someone editing storage by
   hand, which is beside the point - that person can read the journal
   without ever meeting the lock screen (PRD). */

const FIRST_DELAY_MS = 1000;

/** An hour of wrong guesses would have to be someone's deliberate project,
    and the cap keeps a fat-fingered owner from being locked out for a day
    by a doubling that never stops. At a minute a guess, walking all 10,000
    four-digit PINs takes about a week. */
/* MAX_DELAY_MS stays exported only for its own test (AU-09 test-only review). */
export const MAX_DELAY_MS = 60_000;

/** What is owed after `wrongAttempts` consecutive misses. The first is
    free - a mistyped digit is the common case, not an attack. */
/* delayAfterWrongAttempts stays exported only for its own test (AU-09
   test-only review). */
export function delayAfterWrongAttempts(wrongAttempts: number): number {
  if (wrongAttempts < 2) return 0;
  return Math.min(FIRST_DELAY_MS * 2 ** (wrongAttempts - 2), MAX_DELAY_MS);
}

export interface AttemptState {
  wrongAttempts: number;
  /** Pending epoch deadline; zero means monotonic time proved the wait complete. */
  acceptingFrom: number;
}

/** Where the count survives a reload. Storage is device-local and outside
    the journal - a wrong guess is not something to keep, let alone
    something to carry into an archive. */
export interface AttemptStore {
  read(): AttemptState | null;
  write(state: AttemptState): void;
  clear(): void;
}

interface AttemptThrottle {
  /** Milliseconds still owed on the monotonic clock before another attempt counts. */
  remainingMs(now: number): number;
  delayMs(): number;
  recordWrong(now: number): void;
  reset(): void;
}

export function createAttemptThrottle(store?: AttemptStore, mirroredWaitMs?: number): AttemptThrottle {
  const restored = store?.read();
  let wrongAttempts = restored?.wrongAttempts ?? 0;
  let acceptingFrom = restored?.acceptingFrom ?? 0;
  let elapsedDeadline: number | null = null;

  return {
    remainingMs(_now) {
      if (elapsedDeadline === null) {
        const restoredWait = acceptingFrom === 0 ? 0 : delayAfterWrongAttempts(wrongAttempts);
        elapsedDeadline = performance.now() + (mirroredWaitMs ?? restoredWait);
      }
      const remaining = Math.max(0, elapsedDeadline - performance.now());
      if (remaining === 0 && acceptingFrom !== 0) {
        acceptingFrom = 0;
        store?.write({ wrongAttempts, acceptingFrom });
      }
      return remaining;
    },
    delayMs: () => delayAfterWrongAttempts(wrongAttempts),
    recordWrong(now) {
      wrongAttempts++;
      const delay = delayAfterWrongAttempts(wrongAttempts);
      acceptingFrom = now + delay;
      elapsedDeadline = performance.now() + delay;
      store?.write({ wrongAttempts, acceptingFrom });
    },
    reset() {
      wrongAttempts = 0;
      acceptingFrom = 0;
      elapsedDeadline = 0;
      store?.clear();
    }
  };
}
