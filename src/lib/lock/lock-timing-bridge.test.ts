import { afterEach, expect, test, vi } from 'vitest';

const native = vi.hoisted(() => ({ getPinWait: vi.fn(), beginPinAttempt: vi.fn(), finishPinAttempt: vi.fn() }));
vi.mock('../android/plugin-registry', () => ({ androidPluginOwners: { lockTiming: 'LockTiming' }, registerAndroidPlugin: () => native }));
afterEach(() => { vi.clearAllMocks(); vi.resetModules(); });

test('one document owner follows adoption, admission and token-bound settlement', async () => {
  const { androidPinAttempts, readAndroidPinAccounting } = await import('./lock-timing-bridge');
  native.getPinWait.mockResolvedValue({ wrongAttempts: 3, remainingMs: 0 });
  native.beginPinAttempt.mockResolvedValue({ token: 'native-token' });
  native.finishPinAttempt.mockResolvedValue(undefined);
  await readAndroidPinAccounting({ wrongAttempts: 3, acceptingFrom: 0 });
  const owner = native.getPinWait.mock.calls[0][0].owner;
  expect(owner).toMatch(/^[0-9a-f-]{36}$/);
  const token = await androidPinAttempts.begin();
  await androidPinAttempts.finish(token, false);
  expect(native.beginPinAttempt).toHaveBeenCalledWith({ owner });
  expect(native.finishPinAttempt).toHaveBeenCalledWith({ owner, token: 'native-token', successful: false });
});

test('unavailable adoption refuses admission, and native wait retains the busy outcome', async () => {
  const { androidPinAttempts } = await import('./lock-timing-bridge');
  const { KeystoreUnreadableError } = await import('../crypto/keystore');
  const { CredentialsBusyError } = await import('../data/credential-ownership');
  native.getPinWait.mockRejectedValueOnce(new Error('storage unavailable'));
  await expect(androidPinAttempts.begin()).rejects.toBeInstanceOf(KeystoreUnreadableError);
  expect(native.beginPinAttempt).not.toHaveBeenCalled();
  native.getPinWait.mockResolvedValue({ wrongAttempts: 2, remainingMs: 1 });
  native.beginPinAttempt.mockRejectedValue(new Error('pin-attempt-wait'));
  await expect(androidPinAttempts.begin()).rejects.toBeInstanceOf(CredentialsBusyError);
});

test('failed settlement is access unavailable rather than an acknowledged wrong PIN', async () => {
  const { androidPinAttempts } = await import('./lock-timing-bridge');
  const { KeystoreUnreadableError } = await import('../crypto/keystore');
  native.finishPinAttempt.mockRejectedValue(new Error('directory sync failed'));
  await expect(androidPinAttempts.finish('token', false)).rejects.toBeInstanceOf(KeystoreUnreadableError);
});
