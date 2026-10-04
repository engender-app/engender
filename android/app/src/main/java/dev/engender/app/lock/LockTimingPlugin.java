package dev.engender.app.lock;

import android.app.Activity;
import android.content.Context;
import android.content.SharedPreferences;
import android.os.SystemClock;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import dev.engender.app.screencapture.ScreenCapturePlugin;

/** Mirrors lock timing for MainActivity's synchronous Home/Recents decision. */
@CapacitorPlugin(name = "LockTiming")
public class LockTimingPlugin extends Plugin {

    /** The reset test names the file this plugin owns. */
    public static final String PREFS = "engender-lock-timing";
    private static final PinAttemptWait PIN_WAIT = new PinAttemptWait();
    private static final String KEY_TIMING = "timing";
    private static final String KEY_ENABLED = "enabled";
    private static final String LEGACY_PREFS = "engender-quick-exit";

    @PluginMethod
    public void setTiming(PluginCall call) {
        String timing = call.getString("timing");
        if (!"immediately".equals(timing) && !"one-minute".equals(timing)
            && !"five-minutes".equals(timing) && !"restart".equals(timing)) {
            call.reject("Invalid lock timing");
            return;
        }
        prefs(getContext()).edit().putString(KEY_TIMING, timing)
            .putBoolean(KEY_ENABLED, Boolean.TRUE.equals(call.getBoolean("enabled", true))).apply();
        Activity activity = getActivity();
        if (activity != null) activity.runOnUiThread(() ->
            ScreenCapturePlugin.applyWindowFlags(activity, ScreenCapturePlugin.isAllowed(getContext())));
        getContext().deleteSharedPreferences(LEGACY_PREFS);
        call.resolve();
    }

    @PluginMethod
    public void getPinWait(PluginCall call) {
        JSObject result = new JSObject();
        result.put("remainingMs", PIN_WAIT.remaining(SystemClock.elapsedRealtime()));
        call.resolve(result);
    }

    @PluginMethod
    public void setPinWait(PluginCall call) {
        Double remainingMs = call.getDouble("remainingMs");
        if (remainingMs == null || !Double.isFinite(remainingMs)
            || remainingMs < 0 || remainingMs > 60_000) {
            call.reject("Invalid PIN wait");
            return;
        }
        PIN_WAIT.hold((long) Math.ceil(remainingMs), SystemClock.elapsedRealtime());
        call.resolve();
    }

    @PluginMethod
    public void resetPinWait(PluginCall call) {
        PIN_WAIT.reset();
        call.resolve();
    }

    /** Older installs protect Recents until their access mode reaches this mirror. */
    public static boolean isEnabled(Context context) {
        return prefs(context).getBoolean(KEY_ENABLED, true);
    }

    /** Also removes the unused Quick exit flag left by older versions. */
    public static void wipe(Context context) {
        PIN_WAIT.reset();
        prefs(context).edit().clear().commit();
        context.deleteSharedPreferences(LEGACY_PREFS);
    }

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }
}
