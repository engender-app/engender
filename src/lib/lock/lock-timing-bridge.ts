/* Mirrors lock timing so Android can decide whether Home or Recents locks
   before its thumbnail is taken, without asking the WebView first. */

import { androidPluginOwners, registerAndroidPlugin } from '$lib/android/plugin-registry';
import type { LockAfter } from '../data/prefs/catalogue';

interface LockTimingBridge {
  getPinWait(): Promise<{ remainingMs: number }>;
  setPinWait(options: { remainingMs: number }): Promise<void>;
  resetPinWait(): Promise<void>;
  setTiming(options: { timing: LockAfter; enabled: boolean }): Promise<void>;
}

export const androidLockTiming = registerAndroidPlugin<LockTimingBridge>(androidPluginOwners.lockTiming);
