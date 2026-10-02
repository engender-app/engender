package dev.engender.app.lock;

import android.content.Context;
import android.content.SharedPreferences;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Mirrors lock timing for MainActivity's synchronous Home/Recents decision. */
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

    public static boolean locksImmediately(Context context) {
        return "immediately".equals(prefs(context).getString(KEY_TIMING, "restart"));
    }

    /** Also removes the unused Quick exit flag left by older versions. */
    public static void wipe(Context context) {
        prefs(context).edit().clear().commit();
        context.deleteSharedPreferences(LEGACY_PREFS);
    }

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }
}
