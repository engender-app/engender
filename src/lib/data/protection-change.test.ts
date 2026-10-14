import { describe, expect, test, vi } from 'vitest';
import { protectionChange, verifyCurrentProtection, type ProtectionAuthentication } from './protection-change';
import { changeCredentials, invalidateCredentialApprovals } from './credential-ownership';
import { UnlockCancelledError, unlockAttempts } from '../lock/unlock-attempt';
import { DecryptionFailedError } from '../crypto/aesGcm';
import { BiometricUnavailableError } from './webauthn-prf';

const key = () => new Uint8Array(32).fill(7);
function authentication(): ProtectionAuthentication {
  return {
    pin: vi.fn(async () => key()),
    passphrase: vi.fn(async () => key()),
    biometric: vi.fn(async () => key()),
    recovery: vi.fn(async () => key()),
    androidBiometric: vi.fn(async () => 'authenticated')
  };
}

for (const operation of ['mint', 'replace', 'access-mode']) describe(operation, () => {
  test.each(['pin', 'passphrase', 'biometric', 'device-bound'] as const)('requires fresh %s proof on every operation', async mode => {
    const auth = authentication();
    const mutate = vi.fn(async () => operation);
    const make = () => protectionChange({
      current() {}, readCredential: async () => 'current-wrap',
      authenticate: () => verifyCurrentProtection(mode, true, key(), 'current secret', () => {}, auth),
      mutate
    });
    const first = make();
    await expect(first()).resolves.toBe(operation);
    await expect(first()).rejects.toThrow(UnlockCancelledError);
    await expect(make()()).resolves.toBe(operation);
    expect(mutate).toHaveBeenCalledTimes(2);
    expect(mode === 'device-bound' ? auth.androidBiometric : auth[mode]).toHaveBeenCalledTimes(2);
  });

  test.each(['pin', 'passphrase'] as const)('wrong current %s never publishes replacement', async mode => {
    const auth = authentication();
    auth[mode] = async () => { throw new DecryptionFailedError('wrong current secret'); };
    const mutate = vi.fn();
    const run = protectionChange({ current() {}, readCredential: async () => 'old',
      authenticate: () => verifyCurrentProtection(mode, false, key(), 'new secret', () => {}, auth), mutate });
    await expect(run()).rejects.toThrow(DecryptionFailedError);
    expect(mutate).not.toHaveBeenCalled();
  });

  test('web device-bound explicitly uses session authority, never a nonexistent secret', async () => {
    const auth = authentication();
    await verifyCurrentProtection('device-bound', false, key(), '', () => {}, auth);
    for (const verify of Object.values(auth)) expect(verify).not.toHaveBeenCalled();
  });

  test.each(['failed', 'cancelled', 'unavailable', 'unenrolled', 'lockedOut', 'noDeviceCredential', 'unknown'])('Android biometric %s cannot approve', async outcome => {
    const auth = authentication();
    auth.androidBiometric = vi.fn(async () => outcome);
    const mutate = vi.fn();
    const run = protectionChange({ current() {}, readCredential: async () => null,
      authenticate: () => verifyCurrentProtection('device-bound', true, key(), '', () => {}, auth), mutate });
    await expect(run()).rejects.toThrow(outcome === 'cancelled' ? UnlockCancelledError : BiometricUnavailableError);
    expect(mutate).not.toHaveBeenCalled();
    expect(auth.androidBiometric).toHaveBeenCalledExactlyOnceWith();
  });

  test.each(['cancel', 'lock', 'reset', 'session replacement', 'credential change'])('delayed success after %s never publishes', async reason => {
    const lock = unlockAttempts();
    const lockCurrent = lock.begin();
    let session: object | null = {};
    const original = session;
    let cancelled = false;
    let resolve!: () => void;
    let started!: () => void;
    const entered = new Promise<void>(done => { started = done; });
    const pending = new Promise<void>(done => { resolve = done; });
    const mutate = vi.fn();
    const run = protectionChange({ current() {
      lockCurrent();
      if (cancelled || session !== original) throw new UnlockCancelledError();
    }, readCredential: async () => 'wrap', authenticate: () => { started(); return pending; }, mutate });
    const result = run();
    await entered;
    if (reason === 'cancel') cancelled = true;
    if (reason === 'lock') lock.lock();
    if (reason === 'reset') { invalidateCredentialApprovals(); session = null; }
    if (reason === 'session replacement') session = {};
    if (reason === 'credential change') await changeCredentials(async () => {});
    resolve();
    await expect(result).rejects.toThrow(UnlockCancelledError);
    expect(mutate).not.toHaveBeenCalled();
  });

  test('credential publication in another page invalidates delayed authentication', async () => {
    let credential = 'before';
    const mutate = vi.fn();
    const run = protectionChange({ current() {}, readCredential: async () => credential,
      authenticate: async () => { credential = 'after'; }, mutate });
    await expect(run()).rejects.toThrow(UnlockCancelledError);
    expect(mutate).not.toHaveBeenCalled();
  });

  test('same-page credential mutation invalidates a prompt captured before it', async () => {
    const mutate = vi.fn();
    const run = protectionChange({ current() {}, readCredential: async () => 'wrap', authenticate: async () => {}, mutate });
    await changeCredentials(async () => {});
    await expect(run()).rejects.toThrow(UnlockCancelledError);
    expect(mutate).not.toHaveBeenCalled();
  });

  test('publication guard refuses cancellation during replacement derivation', async () => {
    let owned = true;
    const publish = vi.fn();
    const run = protectionChange({ current() { if (!owned) throw new UnlockCancelledError(); },
      readCredential: async () => 'wrap', authenticate: async () => {},
      mutate: async current => { await Promise.resolve(); owned = false; current(); publish(); } });
    await expect(run()).rejects.toThrow(UnlockCancelledError);
    expect(publish).not.toHaveBeenCalled();
  });
});

test('authenticating a different journal key never authorizes this session', async () => {
  const auth = authentication();
  auth.passphrase = async () => new Uint8Array(32).fill(8);
  await expect(verifyCurrentProtection('passphrase', false, key(), 'correct elsewhere', () => {}, auth)).rejects.toThrow(UnlockCancelledError);
});

test('persisted credential replacement while the prompt is waiting invalidates it before authentication', async () => {
  let credential = 'before';
  const authenticate = vi.fn(async () => {});
  const mutate = vi.fn();
  const run = protectionChange({ current() {}, readCredential: async () => credential, authenticate, mutate });
  credential = 'after';
  await expect(run()).rejects.toThrow(UnlockCancelledError);
  expect(authenticate).not.toHaveBeenCalled();
  expect(mutate).not.toHaveBeenCalled();
});

test('Android unlocked mode needs a fresh biometric or existing recovery key, never session authority', async () => {
  const auth = authentication();
  await verifyCurrentProtection('unlocked', true, key(), '', () => {}, auth);
  expect(auth.androidBiometric).toHaveBeenCalledTimes(1);
  await verifyCurrentProtection('unlocked', true, key(), 'existing recovery key', () => {}, auth);
  expect(auth.recovery).toHaveBeenCalledExactlyOnceWith('existing recovery key');
  auth.androidBiometric = async () => 'unavailable';
  await expect(verifyCurrentProtection('unlocked', true, key(), '', () => {}, auth)).rejects.toThrow(BiometricUnavailableError);
  auth.recovery = async () => { throw new DecryptionFailedError('wrong recovery key'); };
  await expect(verifyCurrentProtection('unlocked', true, key(), 'wrong key', () => {}, auth)).rejects.toThrow(DecryptionFailedError);
});
