import { afterEach, expect, test, vi } from 'vitest';
import { changeCredentials, initializeCredentials, CredentialsBusyError } from './credential-ownership';
import { changeJournalPin } from './journal-pin';
import { changeJournalPassphrase } from './journal-passphrase';
import { mintRecoveryKey, revokeRecoveryKey } from './recovery-key';

afterEach(() => vi.unstubAllGlobals());

test.each([false, true])('credential mutation excludes other operations across page lifetimes (native: %s)', async (native) => {
  if (native) vi.stubGlobal('window', { Capacitor: { getPlatform: () => 'android' } });
  let release!: () => void;
  let entered!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; });
  const first = changeCredentials(async () => {
    entered();
    await new Promise<void>(resolve => { release = resolve; });
  });
  await started;
  const competing = vi.fn(async () => {});
  try {
    await expect(changeCredentials(competing)).rejects.toThrow(CredentialsBusyError);
    await expect(changeJournalPin('1234', '5678')).rejects.toThrow(CredentialsBusyError);
    await expect(changeJournalPassphrase('old password', 'new password')).rejects.toThrow(CredentialsBusyError);
    await expect(mintRecoveryKey(new Uint8Array(32))).rejects.toThrow(CredentialsBusyError);
    await expect(revokeRecoveryKey()).rejects.toThrow(CredentialsBusyError);
    expect(competing).not.toHaveBeenCalled();
  } finally { release(); await first; }
  await changeCredentials(competing);
  expect(competing).toHaveBeenCalledTimes(1);
});

test.each([false, true])('failed mutation releases ownership for retry (native: %s)', async (native) => {
  if (native) vi.stubGlobal('window', { Capacitor: { getPlatform: () => 'android' } });
  await expect(changeCredentials(async () => { throw new Error('write refused'); })).rejects.toThrow('write refused');
  await expect(changeCredentials(async () => 'retry')).resolves.toBe('retry');
});

test('native setup reserves ownership before its first microtask', async () => {
  vi.stubGlobal('window', { Capacitor: { getPlatform: () => 'android' } });
  let release!: () => void;
  const setup = initializeCredentials(() => new Promise<void>(resolve => { release = resolve; }));
  try {
    await expect(changeCredentials(async () => 'must not run')).rejects.toThrow(CredentialsBusyError);
  } finally { release(); await setup; }
});
