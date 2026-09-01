/* The Capacitor end of the PinBinding plugin (ticket sec-02-06).

   Kept apart from device-secret.ts for the reason lock/keystore-bridge.ts is
   kept apart from lock/android-key.ts: the module that decides what a PIN's
   secret is stays a pure function of this bridge's answers, testable on the
   Node tier against a fake, with no @capacitor/core anywhere near it. This
   file is the one line that cannot be. */

/* Relative rather than `$lib/...` like the other bridges: journal-pin.ts
   imports this file for its default ports, and the Node tier has no $lib
   alias - the whole test file fails to load on one. */
import { androidPluginOwners, registerAndroidPlugin } from '../android/plugin-registry';
import type { PinBindingBridge } from './device-secret.ts';

export const androidPinBinding = registerAndroidPlugin<PinBindingBridge>(androidPluginOwners.pinBinding);
