import { androidPluginOwners, registerAndroidPlugin } from '$lib/android/plugin-registry';

/** Native mirror of the three preferences that decide what the launcher
    shows (tickets 15 and 50): flips which launcher activity-alias is
    enabled, so the icon and label the launcher and recents show follow the
    same preferences the tab title, the tab icon and the web manifest do
    (ticket 25). The disguised alias outranks every flag, and only the
    disguise half restarts the app. */
interface AndroidDisguiseBridge {
  setLauncherIdentity(options: { disguised: boolean; palette: string; shape: 'current' | 'round' }): Promise<void>;
}

export const androidDisguise = registerAndroidPlugin<AndroidDisguiseBridge>(androidPluginOwners.disguise);
