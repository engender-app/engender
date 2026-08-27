/* The Android end of the reset's third call (phase 5 security ticket 01).

   The other two - deleting the database and erasing the Keystore entry -
   are the journal itself, and they belong to the plugins that made those
   things. This one is everything else the app left on the device: the
   reminder, auto-export and quick-exit preference files, the alarms
   scheduled off the first of them, and the Keystore alias the backup
   password is wrapped under. */

import { androidPluginOwners, registerAndroidPlugin } from '$lib/android/plugin-registry';

export interface AndroidDeviceResetBridge {
  wipe(): Promise<void>;
}

export const androidDeviceReset = registerAndroidPlugin<AndroidDeviceResetBridge>(
  androidPluginOwners.deviceReset
);
