/* Which tint Android draws the status bar's own icons in (carpet ticket 154).

   The app is edge-to-edge, so the bar has no background and the system
   draws its icons over whatever the app painted. Home, setup and the gate
   stopped bleeding their field past the top inset in this ticket, so the
   band behind the bar is the page's own colour there - near white in light,
   near black in dark - and white icons on the light one measure 1.07:1.

   Android picks the tint from its own DayNight resolution unless told, and
   the app's theme is a preference of its own ('system' | 'light' | 'dark'),
   so the two disagree whenever someone runs the app dark on a light phone
   or the other way round. The resolved theme is what this hands down. */

import { androidPluginOwners, registerAndroidPlugin } from '$lib/android/plugin-registry';
import { isAndroid } from '$lib/platform';

interface StatusBarAppearanceBridge {
  setLightIcons(options: { light: boolean }): Promise<void>;
}

const bridge = registerAndroidPlugin<StatusBarAppearanceBridge>(androidPluginOwners.statusBar);

/** `light` is the *background* the bar sits on, which is the theme's own
    sense of the word; the native side turns that into dark glyphs. A
    rejection is swallowed: the tint is the least important thing the chrome
    effect does, and an unhandled rejection there would take the palette,
    the tab icon and the flag's stripes with it. */
export function applyStatusBarAppearance(theme: 'light' | 'dark'): void {
  if (!isAndroid()) return;
  void bridge.setLightIcons({ light: theme === 'light' }).catch(() => {});
}
