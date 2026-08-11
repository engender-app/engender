/* Where the wrong-attempt count lives between page loads (ticket 17), the
   same shape as the boot cache's mirror and for the same reason: the
   throttle itself stays free of browser APIs so it can be tested in the
   Node tier, and the Android shell can hand it a Capacitor Preferences
   adapter behind this interface.

   Not a preference: it describes a moment, not a setting, and it has no
   business in the preference table or in an archive. */

import type { AttemptStore, AttemptState } from './throttle.ts';

export const ATTEMPT_STORE_KEY = 'gender-diary-pin-attempts';

export function localStorageAttempts(): AttemptStore {
  return {
    read() {
      try {
        const raw = localStorage.getItem(ATTEMPT_STORE_KEY);
        if (!raw) return null;
        const { wrongAttempts, acceptingFrom } = JSON.parse(raw) as Partial<AttemptState>;
        // Hand-editable storage: anything that is not a plain number is
        // no state at all, and a count of zero owes nothing anyway.
        if (!Number.isFinite(wrongAttempts) || !Number.isFinite(acceptingFrom)) return null;
        return { wrongAttempts: Math.max(0, wrongAttempts as number), acceptingFrom: acceptingFrom as number };
      } catch {
        return null;
      }
    },
    write(state) {
      try {
        localStorage.setItem(ATTEMPT_STORE_KEY, JSON.stringify(state));
      } catch {
        /* storage full / private mode - the throttle falls back to living
           only as long as the page does */
      }
    },
    clear() {
      try {
        localStorage.removeItem(ATTEMPT_STORE_KEY);
      } catch {
        /* nothing to clear if it could not be written in the first place */
      }
    }
  };
}
