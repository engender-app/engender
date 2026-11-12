/* The Capacitor end of the ScreenCapture plugin (screen-capture-guard/01).

   Mirrors prefs.allowScreenCapture into native SharedPreferences, so
   MainActivity.onCreate can decide FLAG_SECURE before the window has a
   frame - and applies the change to the already-running window immediately,
   because a person who just switched the blocker on wants the app hidden
   right now, not after restarting it. The Security row's switch is the
   blocker, so `allowed` is false while it is on (screenshot-block.ts). */

import { androidPluginOwners, registerAndroidPlugin } from '$lib/android/plugin-registry';

interface ScreenCaptureBridge {
  setAllowed(options: { allowed: boolean }): Promise<void>;
}

export const androidScreenCapture = registerAndroidPlugin<ScreenCaptureBridge>(androidPluginOwners.screenCapture);
