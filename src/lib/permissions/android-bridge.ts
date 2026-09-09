import { androidPluginOwners, registerAndroidPlugin } from '$lib/android/plugin-registry';

/** What checkSelfPermission says about the two permissions no other plugin
    reads. "not-required" is deliberately not one of them: both are runtime
    permissions on every SDK level this app supports. */
export interface AndroidPermissionStatus {
  microphone: 'granted' | 'denied';
  camera: 'granted' | 'denied';
}

interface AndroidPermissionsBridge {
  getStatus(): Promise<AndroidPermissionStatus>;
  /** The app's own details page in system settings - all Android offers for
      a single refused runtime permission, and the only way back from a
      refused microphone or camera (PermissionsPlugin.java). */
  openAppInfo(): Promise<void>;
}

export const androidPermissions = registerAndroidPlugin<AndroidPermissionsBridge>(
  androidPluginOwners.permissions
);
