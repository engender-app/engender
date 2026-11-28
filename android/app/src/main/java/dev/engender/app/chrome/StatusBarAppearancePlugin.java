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
 * Set icon tint over the app's edge-to-edge status bar. The web side
 * resolves system, light or dark from prefs.theme and supplies the
 * result, which can differ from AppCompat's theme. White icons over
 * the light field measured 1.07:1 without this setting.
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
