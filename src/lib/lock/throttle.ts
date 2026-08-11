/* The growing delay after wrong PIN attempts (ADR-0014). Deliberately not
   an attempt limit: nothing here ever wipes anything, because the only way
   to lose the journal has to be one the user chose (the reset action on
   the lock screen), not one a bored kid can trip into.

   Time comes in as an argument rather than from Date.now(), so the growth
   is testable without a clock and without a real hash - the throttle knows
   nothing about PINs.

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
export const MAX_DELAY_MS = 60_000;

/** What is owed after `wrongAttempts` consecutive misses. The first is
    free - a mistyped digit is the common case, not an attack. */
export function delayAfterWrongAttempts(wrongAttempts: number): number {
  if (wrongAttempts < 2) return 0;
  return Math.min(FIRST_DELAY_MS * 2 ** (wrongAttempts - 2), MAX_DELAY_MS);
}

export interface AttemptState {
  wrongAttempts: number;
  /** Epoch milliseconds: the moment the next attempt starts counting. */
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

export interface AttemptThrottle {
  /** Milliseconds still to wait at `now` before another attempt counts. */
  remainingMs(now: number): number;
  recordWrong(now: number): void;
  reset(): void;
}

export function createAttemptThrottle(store?: AttemptStore): AttemptThrottle {
  const restored = store?.read();
  let wrongAttempts = restored?.wrongAttempts ?? 0;
  let acceptingFrom = restored?.acceptingFrom ?? 0;

  return {
    /* Capped at what the current count is worth, so a clock that moved -
       or a stored moment that was tampered into the far future - costs one
       delay rather than locking the owner out until the date arrives. */
    remainingMs: (now) =>
      Math.min(Math.max(0, acceptingFrom - now), delayAfterWrongAttempts(wrongAttempts)),
    recordWrong(now) {
      wrongAttempts++;
      acceptingFrom = now + delayAfterWrongAttempts(wrongAttempts);
      store?.write({ wrongAttempts, acceptingFrom });
    },
    reset() {
      wrongAttempts = 0;
      acceptingFrom = 0;
      store?.clear();
    }
  };
}
