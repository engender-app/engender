/* The growing delay after wrong PIN attempts (ADR-0014). Deliberately not
   an attempt limit: nothing here ever wipes anything, because the only way
   to lose the journal has to be one the user chose (the reset action on
   the lock screen), not one a bored kid can trip into.

   Time comes in as an argument rather than from Date.now(), so the growth
   is testable without a clock and without a real hash - the throttle knows
   nothing about PINs.

   It lives in memory, so a reload clears it. That is the right size for
   what app lock is: a deterrent against someone who picks up the phone,
   not against someone holding the browser profile, who can read the
   journal without ever meeting the lock screen (PRD). */

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

export interface AttemptThrottle {
  /** Milliseconds still to wait at `now` before another attempt counts. */
  remainingMs(now: number): number;
  recordWrong(now: number): void;
  reset(): void;
}

export function createAttemptThrottle(): AttemptThrottle {
  let wrongAttempts = 0;
  let acceptingFrom = 0;

  return {
    remainingMs: (now) => Math.max(0, acceptingFrom - now),
    recordWrong(now) {
      wrongAttempts++;
      acceptingFrom = now + delayAfterWrongAttempts(wrongAttempts);
    },
    reset() {
      wrongAttempts = 0;
      acceptingFrom = 0;
    }
  };
}
