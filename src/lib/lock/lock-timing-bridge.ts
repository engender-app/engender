/* Native PIN admission owns the count; the gate only displays its wait. */

import { androidPluginOwners, registerAndroidPlugin } from '../android/plugin-registry';
import type { LockAfter } from '../data/prefs/catalogue';
import { mintUuid } from '../data/journal/support';
import { CredentialsBusyError } from '../data/credential-ownership';
import { KeystoreUnreadableError } from '../crypto/keystore';
import { localStorageAttempts } from './attempt-store';

interface PinAccounting {
  remainingMs: number;
  fullDelayMs: number;
  proven: boolean;
  wrongAttempts: number;
  adopted: boolean;
}

interface LockTimingBridge {
  getPinWait(options?: { owner: string; legacyWrongAttempts: number; legacyPending: boolean }): Promise<PinAccounting>;
  setPinWait(options: { remainingMs: number; fullDelayMs: number }): Promise<void>;
  beginPinAttempt(options: { owner: string }): Promise<{ token: string }>;
  finishPinAttempt(options: { owner: string; token: string; successful: boolean }): Promise<void>;
  setTiming(options: { timing: LockAfter }): Promise<void>;
}

export const androidLockTiming = registerAndroidPlugin<LockTimingBridge>(androidPluginOwners.lockTiming);

let documentOwner: string | undefined;
const owner = () => documentOwner ??= mintUuid();

/** Adoption is one-time; later WebView mirrors cannot replace native counts. */
export async function readAndroidPinAccounting(legacy = localStorageAttempts().read()): Promise<PinAccounting> {
  return androidLockTiming.getPinWait({ owner: owner(),
    legacyWrongAttempts: Math.min(2_147_483_647, Math.ceil(Math.max(0, legacy?.wrongAttempts ?? 0))),
    legacyPending: Boolean(legacy?.acceptingFrom) });
}

export const androidPinAttempts = {
  async begin(): Promise<string> {
    try {
      await readAndroidPinAccounting();
      return (await androidLockTiming.beginPinAttempt({ owner: owner() })).token;
    } catch (error) {
      if (/pin-attempt-(busy|wait)/.test(String((error as Error)?.message))) throw new CredentialsBusyError();
      throw new KeystoreUnreadableError('PIN accounting could not be persisted');
    }
  },
  async finish(token: string, successful: boolean): Promise<void> {
    try { await androidLockTiming.finishPinAttempt({ owner: owner(), token, successful }); }
    catch { throw new KeystoreUnreadableError('PIN accounting could not be settled'); }
  }
};
