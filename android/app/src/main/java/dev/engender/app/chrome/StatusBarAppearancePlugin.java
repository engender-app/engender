package dev.engender.app.chrome;

import android.app.Activity;
import android.view.Window;

import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Which tint Android draws the status bar's own icons in (carpet ticket
 * 154).
 *
 * The app is edge-to-edge - targetSdk 36 enforces it, and the window
 * carries EDGE_TO_EDGE_ENFORCED - so the bar has no background of its own
 * and the system draws the clock, the signal bars and the battery straight
 * over whatever the app painted. Which tint it uses is the app's to say,
 * and until this plugin the app never said: read off a Pixel 10a on
 * 2026-09-21, with the phone in day mode, `dumpsys window` reported
 * `AppearanceRegion{ bounds=...}` for this app against
 * `AppearanceRegion{LIGHT_STATUS_BARS bounds=...}` for Settings on the same
 * display. Empty means white icons, which the ticket's renders measured at
 * 1.07:1 over the light theme's own #F4F8FB.
 *
 * The theme the app resolves is not the theme AppCompat's DayNight parent
 * would pick either: `prefs.theme` is 'system' | 'light' | 'dark', so
 * someone can run the app dark on a light phone. The web side owns that
 * resolution and hands the answer down; nothing here reads the system.
 */
@CapacitorPlugin(name = "StatusBarAppearance")
public class StatusBarAppearancePlugin extends Plugin {

    @PluginMethod
    public void setLightIcons(PluginCall call) {
        boolean light = Boolean.TRUE.equals(call.getBoolean("light", false));
        Activity activity = getActivity();
        if (activity == null) {
            call.resolve();
            return;
        }
        activity.runOnUiThread(() -> apply(activity.getWindow(), light));
        call.resolve();
    }

    /** Light *background* means dark glyphs, which is what the flag's name
        says and the opposite of what it reads like: setAppearanceLightStatusBars(true)
        asks for a bar suited to a light background. The caller passes the
        theme's own sense of light, so the inversion lives here rather than
        in every call site. */
    static void apply(Window window, boolean lightBackground) {
        WindowInsetsControllerCompat controller =
            WindowCompat.getInsetsController(window, window.getDecorView());
        controller.setAppearanceLightStatusBars(lightBackground);
    }
}
