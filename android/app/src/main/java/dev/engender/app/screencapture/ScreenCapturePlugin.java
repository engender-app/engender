package dev.engender.app.screencapture;

import android.app.Activity;
import android.content.Context;
import android.content.SharedPreferences;
import android.os.Build;
import android.view.WindowManager;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import dev.engender.app.disguise.DisguiseAlias;

/**
 * Mirrors prefs.allowScreenCapture into SharedPreferences, so
 * MainActivity.onCreate can decide FLAG_SECURE before the window has a
 * frame. Unlike LockTimingPlugin's read-only mirror, setAllowed also flips the flag on the window that
 * is already running: a person who just turned this on in Settings wants to
 * record right now, not after restarting the app.
 */
@CapacitorPlugin(name = "ScreenCapture")
public class ScreenCapturePlugin extends Plugin {

    /** Named rather than private for the same reason as LockTimingPlugin.PREFS:
        the reset's test has to name the file it claims to have cleared. */
    public static final String PREFS = "engender-screen-capture";
    private static final String KEY_ALLOWED = "allowed";

    @PluginMethod
    public void setAllowed(PluginCall call) {
        boolean allowed = Boolean.TRUE.equals(call.getBoolean("allowed", false));
        prefs(getContext()).edit().putBoolean(KEY_ALLOWED, allowed).apply();
        Activity activity = getActivity();
        if (activity != null) {
            activity.runOnUiThread(() -> applyWindowFlags(activity, allowedNow(activity)));
        }
        call.resolve();
    }

    /** The person's own capture choice, as stored. */
    public static boolean isAllowed(Context context) {
        return prefs(context).getBoolean(KEY_ALLOWED, true);
    }

    /** Whether the window may be captured right now. Disguise forces it off
        (FA 43): capture is allowed by default, so a disguised app's Recents
        card would otherwise show "Notes" over a thumbnail of the journal.
        Read off the live launcher alias, as the widgets and notifications
        do, so it holds from the first frame of a cold start with no WebView
        and needs no second copy of the preference. The stored choice is
        kept, and comes back when disguise goes off. */
    public static boolean allowedNow(Context context) {
        return isAllowed(context) && !DisguiseAlias.isDisguised(context);
    }

    /** The capture choice alone decides both screenshots and the Recents
        preview; a journal lock hides neither (Alicja, 2026-10-06). Android 13
        separates the two, so the Recents half needs its own call there;
        below 13 FLAG_SECURE covers both. */
    public static void applyWindowFlags(Activity activity, boolean allowed) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            activity.setRecentsScreenshotEnabled(allowed);
        }
        if (allowed) {
            activity.getWindow().clearFlags(WindowManager.LayoutParams.FLAG_SECURE);
        } else {
            activity.getWindow().setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE);
        }
    }

    /** The reset path removes this device's capture choice. A fresh install
        allows capture by default. */
    public static void wipe(Context context) {
        prefs(context).edit().clear().commit();
    }

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }
}
