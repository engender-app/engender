/* Mirrors lock timing to the native side, and holds the PIN wait there. */

import { androidPluginOwners, registerAndroidPlugin } from '$lib/android/plugin-registry';
import type { LockAfter } from '../data/prefs/catalogue';

interface LockTimingBridge {
  getPinWait(): Promise<{ remainingMs: number; fullDelayMs: number; proven: boolean }>;
  setPinWait(options: { remainingMs: number; fullDelayMs: number }): Promise<void>;
  resetPinWait(): Promise<void>;
  setTiming(options: { timing: LockAfter }): Promise<void>;
}

export const androidLockTiming = registerAndroidPlugin<LockTimingBridge>(androidPluginOwners.lockTiming);
