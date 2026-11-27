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
import dev.engender.app.lock.LeaveCover;

/**
 * Mirrors prefs.allowScreenCapture into SharedPreferences, so
 * MainActivity.onCreate can decide FLAG_SECURE before the window has a
 * frame. Unlike LockTimingPlugin's read-only mirror, setAllowed also flips the flag on the window that
 * is already running: a person who just switched "Block screenshots" on in
 * Settings wants the app hidden right now, not after restarting it. That
 * switch is the blocker, so it sends allowed=false when it goes on.
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
            activity.runOnUiThread(() -> applyWindowFlags(activity));
        }
        call.resolve();
    }

    /** The person's own capture choice, as stored: false once they have
        switched "Block screenshots" on, true until then. */
    public static boolean isAllowed(Context context) {
        return prefs(context).getBoolean(KEY_ALLOWED, true);
    }

    /** Whether the window carries FLAG_SECURE, which refuses screenshots and
        screen recording. The capture choice decides it alone. The one
        exception is Android 12 and older, where the flag is also the only way
        to blank the Recents card, so disguise keeps it there (ADR 0101). From
        Android 13 disguise hides the card with its own call and a person who
        has left "Block screenshots" off can still take a screenshot of a disguised app.
*/
    public static boolean windowSecure(int sdk, boolean allowed, boolean disguised) {
        return !allowed || (disguised && sdk < Build.VERSION_CODES.TIRAMISU);
    }

    /** Whether Recents may keep a preview of the app (Android 13 and later). Hidden when
        the person blocks capture, and when the launcher is disguised: nothing is blocked by
        default, so a disguised app's card would otherwise show "Notes" over a thumbnail of
        the journal. */
    public static boolean recentsPreviewShown(boolean allowed, boolean disguised) {
        return allowed && !disguised;
    }

    /** Applies the stored capture choice and the live disguise state. Disguise is read off
        the launcher alias, as the widgets and notifications do, so it holds from the first
        frame of a cold start with no WebView and needs no second copy of the preference.
        Neither the stored choice nor the window flag is changed by disguise going on or
        off. A journal lock hides no screenshot, but while a lock is set the Recents preview
        is never kept (Android 13+), because it would show the journal after the lock
        engaged. */
    public static void applyWindowFlags(Activity activity) {
        applyWindowFlags(activity, isAllowed(activity));
    }

    public static void applyWindowFlags(Activity activity, boolean allowed) {
        applyWindowFlags(activity, allowed, DisguiseAlias.isDisguised(activity));
    }

    /** The last value handed to setRecentsScreenshotEnabled, which has no
        getter. Read by device tests only. */
    static volatile Boolean recentsScreenshotEnabled;

    public static void applyWindowFlags(Activity activity, boolean allowed, boolean disguised) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            boolean shown = LeaveCover.recentsPreviewAllowed(recentsPreviewShown(allowed, disguised));
            recentsScreenshotEnabled = shown;
            activity.setRecentsScreenshotEnabled(shown);
        }
        if (windowSecure(Build.VERSION.SDK_INT, allowed, disguised)) {
            activity.getWindow().setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE);
        } else {
            activity.getWindow().clearFlags(WindowManager.LayoutParams.FLAG_SECURE);
        }
    }

    /** Called on the main thread by the disguise switch just before the
        launcher identity flips. The window is given the state it is about to
        have, so a snapshot taken from here on - including the one the system
        takes as the process goes and comes back - is already the blank one,
        rather than the journal under the new name. */
    public static void coverForIdentityChange(Activity activity, boolean toDisguised) {
        applyWindowFlags(activity, isAllowed(activity), toDisguised);
    }

    /** The reset path removes this device's capture choice. A fresh install
        blocks nothing until the person switches the blocker on. */
    public static void wipe(Context context) {
        prefs(context).edit().clear().commit();
    }

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }
}
