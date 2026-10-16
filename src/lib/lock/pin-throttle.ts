/* Android reads the durable admission ledger; web remounts share elapsed time. */
import { isAndroid } from '$lib/platform';
import { readAndroidPinAccounting } from './lock-timing-bridge';
import { createAttemptThrottle, type AttemptStore } from './throttle';

let sessionDeadline: number | null = null;

export async function createPinThrottle(store: AttemptStore) {
  const android = isAndroid();
  if (android) {
    let throttle: ReturnType<typeof createAttemptThrottle>;
    const refresh = async () => {
      const native = await readAndroidPinAccounting(store.read());
      const state = { wrongAttempts: native.wrongAttempts,
        acceptingFrom: native.remainingMs > 0 ? Date.now() + native.remainingMs : 0 };
      store.write(state); // Optional display mirror, never the Android authority.
      throttle = createAttemptThrottle({ ...store, read: () => state }, native.remainingMs);
    };
    await refresh();
    return {
      remainingMs: (now: number) => throttle.remainingMs(now),
      refresh,
      recordWrong: refresh, // unlockJournalPin already admitted and settled this guess.
      async reset() {
        await refresh(); // Only successful authentication resets the native owner.
      }
    };
  }
  const sessionWait = sessionDeadline === null ? undefined : Math.max(0, sessionDeadline - performance.now());
  const throttle = createAttemptThrottle(store, sessionWait);
  const remainingMs = throttle.remainingMs(Date.now());
  sessionDeadline = performance.now() + remainingMs;
  return {
    remainingMs: throttle.remainingMs,
    async refresh() {},
    async recordWrong(now: number) {
      throttle.recordWrong(now);
      const remainingMs = throttle.remainingMs(now);
      sessionDeadline = performance.now() + remainingMs;
    },
    async reset() {
      throttle.reset();
      sessionDeadline = null;
    }
  };
}
