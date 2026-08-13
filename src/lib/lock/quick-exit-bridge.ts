/* The Capacitor end of the QuickExit plugin (ticket 15).

   Mirrors prefs.quickExit into native SharedPreferences, so
   MainActivity.onUserLeaveHint can read it without a round trip through the
   WebView's JS thread when the person leaves the app - by the time a
   message reached this thread and back, the system may already have taken
   its recents snapshot. */

import { androidPluginOwners, registerAndroidPlugin } from '$lib/android/plugin-registry';

export interface QuickExitBridge {
  setEnabled(options: { enabled: boolean }): Promise<void>;
}

export const androidQuickExit = registerAndroidPlugin<QuickExitBridge>(androidPluginOwners.quickExit);
