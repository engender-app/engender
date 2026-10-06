/* A PIN gate can remount without ending the session. Keep its elapsed-time
   wait here, and mirror it natively so a WebView reload cannot clear it. */
import { isAndroid } from '$lib/platform';
import { androidLockTiming } from './lock-timing-bridge';
import { createAttemptThrottle, delayAfterWrongAttempts, type AttemptStore } from './throttle';

let sessionDeadline: number | null = null;

export async function createPinThrottle(store: AttemptStore) {
  const android = isAndroid();
  const native = android ? await androidLockTiming.getPinWait() : undefined;
  const pending = store.read();
  const nativeWait = native?.proven && (!pending?.acceptingFrom ||
    native.fullDelayMs >= delayAfterWrongAttempts(pending.wrongAttempts)) ? native.remainingMs : undefined;
  const sessionWait = sessionDeadline === null ? undefined : Math.max(0, sessionDeadline - performance.now());
  const mirroredWait = nativeWait === undefined ? sessionWait : Math.max(nativeWait, sessionWait ?? 0);
  const throttle = createAttemptThrottle(store, mirroredWait);
  const remainingMs = throttle.remainingMs(Date.now());
  sessionDeadline = performance.now() + remainingMs;
  if (android) await androidLockTiming.setPinWait({ remainingMs, fullDelayMs: throttle.delayMs() });
  return {
    remainingMs: throttle.remainingMs,
    async recordWrong(now: number) {
      throttle.recordWrong(now);
      const remainingMs = throttle.remainingMs(now);
      sessionDeadline = performance.now() + remainingMs;
      if (android) await androidLockTiming.setPinWait({ remainingMs, fullDelayMs: throttle.delayMs() });
    },
    async reset() {
      if (android) await androidLockTiming.resetPinWait();
      throttle.reset();
      sessionDeadline = null;
    }
  };
}
