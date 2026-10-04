/* A PIN gate can remount without ending the session. Keep its elapsed-time
   wait here, and mirror it natively so a WebView reload cannot clear it. */
import { isAndroid } from '$lib/platform';
import { androidLockTiming } from './lock-timing-bridge';
import { createAttemptThrottle, type AttemptStore } from './throttle';

let sessionDeadline = 0;

export async function createPinThrottle(store: AttemptStore) {
  const android = isAndroid();
  const nativeWait = android ? (await androidLockTiming.getPinWait()).remainingMs : 0;
  const mirroredWait = Math.max(nativeWait, sessionDeadline - performance.now(), 0);
  const throttle = createAttemptThrottle(store, mirroredWait);
  const remainingMs = throttle.remainingMs(Date.now());
  sessionDeadline = performance.now() + remainingMs;
  if (android) await androidLockTiming.setPinWait({ remainingMs });
  return {
    remainingMs: throttle.remainingMs,
    async recordWrong(now: number) {
      throttle.recordWrong(now);
      const remainingMs = throttle.remainingMs(now);
      sessionDeadline = performance.now() + remainingMs;
      if (android) await androidLockTiming.setPinWait({ remainingMs });
    },
    async reset() {
      if (android) await androidLockTiming.resetPinWait();
      throttle.reset();
      sessionDeadline = 0;
    }
  };
}
