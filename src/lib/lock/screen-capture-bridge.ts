/* The Capacitor end of the ScreenCapture plugin (screen-capture-guard/01).

   Mirrors prefs.allowScreenCapture into native SharedPreferences, so
   MainActivity.onCreate can decide FLAG_SECURE before the window has a
   frame - and applies the change to the already-running window immediately,
   because a person who just turned this on wants to record right now, not
   after restarting the app. */

import { androidPluginOwners, registerAndroidPlugin } from '$lib/android/plugin-registry';

interface ScreenCaptureBridge {
  setAllowed(options: { allowed: boolean }): Promise<void>;
}

export const androidScreenCapture = registerAndroidPlugin<ScreenCaptureBridge>(androidPluginOwners.screenCapture);
