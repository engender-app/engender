package dev.engender.app.lock;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.SystemClock;
import android.provider.Settings;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Mirrors lock timing to the native side and keeps the PIN wait. */
@CapacitorPlugin(name = "LockTiming")
public class LockTimingPlugin extends Plugin {

    /** The reset test names the file this plugin owns. */
    public static final String PREFS = "engender-lock-timing";
    private static final String KEY_TIMING = "timing";
    private static final String LEGACY_PREFS = "engender-quick-exit";

    @PluginMethod
    public void setTiming(PluginCall call) {
        String timing = call.getString("timing");
        if (!"immediately".equals(timing) && !"one-minute".equals(timing)
            && !"five-minutes".equals(timing) && !"restart".equals(timing)) {
            call.reject("Invalid lock timing");
            return;
        }
        prefs(getContext()).edit().putString(KEY_TIMING, timing).apply();
        getContext().deleteSharedPreferences(LEGACY_PREFS);
        call.resolve();
    }

    @PluginMethod
    public void getPinWait(PluginCall call) {
        JSObject result = new JSObject();
        try {
            synchronized (PinAttemptWait.class) {
                PinAttemptWait wait = pinWait(getContext());
                result.put("remainingMs", wait.remaining(SystemClock.elapsedRealtime(), bootCount(getContext())));
                result.put("proven", wait.hasState());
                result.put("fullDelayMs", wait.fullDelayMs());
            }
        } catch (IllegalStateException error) {
            call.reject(error.getMessage(), error);
            return;
        }
        call.resolve(result);
    }

    @PluginMethod
    public void setPinWait(PluginCall call) {
        Double remainingMs = call.getDouble("remainingMs");
        Double fullDelayMs = call.getDouble("fullDelayMs");
        if (remainingMs == null || !Double.isFinite(remainingMs)
            || remainingMs < 0 || remainingMs > 60_000
            || fullDelayMs == null || !Double.isFinite(fullDelayMs)
            || fullDelayMs < remainingMs || fullDelayMs > 60_000) {
            call.reject("Invalid PIN wait");
            return;
        }
        try {
            synchronized (PinAttemptWait.class) {
                pinWait(getContext()).hold((long) Math.ceil(remainingMs), (long) Math.ceil(fullDelayMs),
                    SystemClock.elapsedRealtime(), bootCount(getContext()));
            }
        } catch (IllegalStateException error) {
            call.reject(error.getMessage(), error);
            return;
        }
        call.resolve();
    }

    @PluginMethod
    public void resetPinWait(PluginCall call) {
        try {
            synchronized (PinAttemptWait.class) { pinWait(getContext()).reset(); }
        } catch (IllegalStateException error) {
            call.reject(error.getMessage(), error);
            return;
        }
        call.resolve();
    }

    /** Also removes the unused Quick exit flag left by older versions. */
    public static void wipe(Context context) {
        synchronized (PinAttemptWait.class) { prefs(context).edit().clear().commit(); }
        context.deleteSharedPreferences(LEGACY_PREFS);
    }

    static int bootCount(Context context) {
        return Settings.Global.getInt(context.getContentResolver(), Settings.Global.BOOT_COUNT, 0);
    }

    static PinAttemptWait pinWait(Context context) {
        SharedPreferences preferences = prefs(context);
        return new PinAttemptWait(new PinAttemptWait.Store() {
            public PinAttemptWait.State read() {
                if (!preferences.contains("pinDeadline")) return null;
                return new PinAttemptWait.State(preferences.getLong("pinDeadline", 0),
                    preferences.getInt("pinBootCount", -1), preferences.getLong("pinFullDelayMs", 0));
            }
            public void write(PinAttemptWait.State state) {
                if (!preferences.edit().putLong("pinDeadline", state.deadline)
                    .putInt("pinBootCount", state.bootCount).putLong("pinFullDelayMs", state.fullDelayMs).commit()) {
                    throw new IllegalStateException("could not persist PIN wait");
                }
            }
            public void clear() {
                if (!preferences.edit().remove("pinDeadline").remove("pinBootCount")
                    .remove("pinFullDelayMs").commit()) throw new IllegalStateException("could not clear PIN wait");
            }
        });
    }

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }
}
