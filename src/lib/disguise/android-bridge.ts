import { androidPluginOwners, registerAndroidPlugin } from '$lib/android/plugin-registry';

/** Native mirror of prefs.disguise (ticket 15): flips which launcher
    activity-alias is enabled, so the icon and label the launcher and
    recents show follow the same preference the tab title and the web
    manifest do (ticket 25). */
export interface AndroidDisguiseBridge {
  setDisguised(options: { disguised: boolean }): Promise<void>;
}

export const androidDisguise = registerAndroidPlugin<AndroidDisguiseBridge>(androidPluginOwners.disguise);
