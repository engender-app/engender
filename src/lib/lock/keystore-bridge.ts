/* The Capacitor end of the Keystore plugin (ticket 13).

   Kept apart from android-key.ts so that the flow which decides whether the
   Journal opens is a pure function of the bridge's answers, testable on the
   Node tier against a fake, with no @capacitor/core anywhere near it. This
   file is the one line that cannot be. */

import { androidPluginOwners, registerAndroidPlugin } from '$lib/android/plugin-registry';
import type { KeystoreBridge } from './android-key.ts';

export const androidKeystore = registerAndroidPlugin<KeystoreBridge>(androidPluginOwners.keystore);
