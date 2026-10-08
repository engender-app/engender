import { expect, test } from 'vitest';
import { unlockAttempts, UnlockCancelledError } from './unlock-attempt';
import { watchLeave } from './leave-lock';
import { confirmWithBiometrics, type KeystoreBridge } from './android-key';

for (const outcome of ['authenticated', 'cancelled', 'failed']) {
  test(`a delayed device confirmation ${outcome} cannot override a later lock`, async () => {
    const attempts = unlockAttempts();
    const current = attempts.begin();
    let release!: (value: { outcome: string }) => void;
    const unexpected = async () => { throw new Error('confirmation must not use key-storage methods'); };
    const bridge: KeystoreBridge = {
      confirm: () => new Promise((resolve) => { release = resolve; }),
      status: unexpected, create: unexpected, wrap: unexpected, unlock: unexpected, erase: unexpected
    };
    const authentication = confirmWithBiometrics(bridge, {
      title: 'Unlock', subtitle: 'Confirm', cancel: 'Cancel', deviceCredential: false
    });
    attempts.lock();
    release({ outcome });
    const result = await authentication;
    expect(result.unlocksJournal).toBe(outcome === 'authenticated');
    expect(current).toThrow(UnlockCancelledError);
    expect(attempts.begin()).not.toThrow();
  });
}

test('the app own system prompt preserves the pending attempt within its grace', () => {
  const attempts = unlockAttempts();
  const current = attempts.begin();
  const native = {};
  let now = 0;
  const stop = watchLeave({
    page: Object.assign(new EventTarget(), { visibilityState: 'visible' as const }),
    native, lockAfter: () => 'immediately', lock: () => attempts.lock(), now: () => now
  });
  const hooks = native as { __lockOnLeaveFromNative: (own?: boolean) => void; __lockOnReturnFromNative: () => void };
  hooks.__lockOnLeaveFromNative(true);
  now = 30_000;
  hooks.__lockOnReturnFromNative();
  expect(current).not.toThrow();
  hooks.__lockOnLeaveFromNative(true);
  now += 60_000;
  hooks.__lockOnReturnFromNative();
  expect(current).toThrow(UnlockCancelledError);
  stop();
});
