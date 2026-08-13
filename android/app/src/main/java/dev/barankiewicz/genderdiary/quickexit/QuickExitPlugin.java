package dev.barankiewicz.genderdiary.quickexit;

import android.content.Context;
import android.content.SharedPreferences;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Mirrors prefs.quickExit (ticket 15) into SharedPreferences, where
 * MainActivity.onUserLeaveHint can read it without a round trip through the
 * WebView's JS thread - the whole point being that leaving the app locks it
 * before the system takes its recents snapshot, not sometime after.
 */
@CapacitorPlugin(name = "QuickExit")
public class QuickExitPlugin extends Plugin {

    private static final String PREFS = "gender-diary-quick-exit";
    private static final String KEY_ENABLED = "enabled";

    @PluginMethod
    public void setEnabled(PluginCall call) {
        boolean enabled = Boolean.TRUE.equals(call.getBoolean("enabled", false));
        prefs(getContext()).edit().putBoolean(KEY_ENABLED, enabled).apply();
        call.resolve();
    }

    public static boolean isEnabled(Context context) {
        return prefs(context).getBoolean(KEY_ENABLED, false);
    }

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }
}
