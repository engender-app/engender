package dev.engender.app.screencapture;

import android.app.Activity;
import android.content.Context;
import android.content.SharedPreferences;
import android.view.WindowManager;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Mirrors prefs.allowScreenCapture into SharedPreferences, so
 * MainActivity.onCreate can decide FLAG_SECURE before the window has a
 * frame - the same reason QuickExitPlugin mirrors prefs.quickExit. Unlike
 * that read-only mirror, setAllowed also flips the flag on the window that
 * is already running: a person who just turned this on in Settings wants to
 * record right now, not after restarting the app.
 */
@CapacitorPlugin(name = "ScreenCapture")
public class ScreenCapturePlugin extends Plugin {

    /** Named rather than private for the same reason as QuickExitPlugin.PREFS:
        the reset's test has to name the file it claims to have cleared. */
    public static final String PREFS = "engender-screen-capture";
    private static final String KEY_ALLOWED = "allowed";

    @PluginMethod
    public void setAllowed(PluginCall call) {
        boolean allowed = Boolean.TRUE.equals(call.getBoolean("allowed", false));
        prefs(getContext()).edit().putBoolean(KEY_ALLOWED, allowed).apply();
        Activity activity = getActivity();
        if (activity != null) {
            activity.runOnUiThread(() -> applyWindowFlags(activity, allowed));
        }
        call.resolve();
    }

    public static boolean isAllowed(Context context) {
        return prefs(context).getBoolean(KEY_ALLOWED, false);
    }

    /** One flag either way: Android ties the recents thumbnail, screenshots
        and screen recording together under FLAG_SECURE, with no finer
        control to ask for. Shared between the live toggle above and
        MainActivity's cold-start read, so the two can never disagree about
        what "allowed" means. */
    public static void applyWindowFlags(Activity activity, boolean allowed) {
        if (allowed) {
            activity.getWindow().clearFlags(WindowManager.LayoutParams.FLAG_SECURE);
        } else {
            activity.getWindow().setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE);
        }
    }

    /** The reset path. Whether this device was allowed to capture the
        screen says something about that device, and the reset claims to
        leave nothing - the same default-off protection a fresh install
        gets. */
    public static void wipe(Context context) {
        prefs(context).edit().clear().commit();
    }

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }
}
