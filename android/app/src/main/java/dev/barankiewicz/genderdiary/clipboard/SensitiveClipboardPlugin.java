package dev.barankiewicz.genderdiary.clipboard;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * The one bridge call {@link SensitiveClipboard} exists for: copy this
 * string, marked sensitive, and take it back off the clipboard afterwards.
 *
 * One method, and deliberately no second one. There is nothing here that
 * reads the clipboard, so a compromise of the WebView cannot ask this plugin
 * what somebody has copied - which the plain web clipboard API would answer
 * given permission. The recovery key screen is the only caller.
 *
 * Nothing logs the value. The plugin itself never touches a logger, and the
 * bridge's own verbose log of every call's arguments - Bridge's
 * "methodData: ..." line, which a debuggable build used to print - is off
 * for every build since capacitor.config.ts set loggingBehavior to "none".
 */
@CapacitorPlugin(name = "SensitiveClipboard")
public class SensitiveClipboardPlugin extends Plugin {

    @PluginMethod
    public void copy(PluginCall call) {
        String value = call.getString("value");
        if (value == null || value.isEmpty()) {
            call.reject("nothing to copy");
            return;
        }

        Long clearAfterMs = call.getLong("clearAfterMs");
        if (clearAfterMs == null || clearAfterMs <= 0) {
            call.reject("a sensitive copy needs the interval it is cleared after");
            return;
        }

        /* On the main thread, like PrintPlugin's dialog and for a related
           reason: the bridge calls plugin methods off it, and a clipboard
           write from a background thread crashes on the OEM builds that put
           a toast behind setPrimaryClip. */
        getActivity()
            .runOnUiThread(
                () -> {
                    try {
                        SensitiveClipboard.copy(getContext(), value, clearAfterMs);
                        call.resolve();
                    } catch (RuntimeException e) {
                        // The message names the failure, never the value.
                        call.reject("could not reach the clipboard", e);
                    }
                });
    }

    /**
     * A clear can be owed by a process that no longer exists: Android is free
     * to kill this app while the person is in their password manager with the
     * key on the clipboard. The record of it outlives the process, so the
     * first thing a new one does is ask whether the clipboard is still
     * holding it.
     */
    @Override
    public void load() {
        super.load();
        SensitiveClipboard.clearIfDue(getContext());
    }

    /**
     * The clear is due at a moment this app may not be in front of, and from
     * Android 10 an app without focus cannot read the clipboard to find out
     * whether what it is about to wipe is still its own. Coming back is when
     * that question can be answered, so it is asked again here.
     */
    @Override
    protected void handleOnResume() {
        super.handleOnResume();
        SensitiveClipboard.clearIfDue(getContext());
    }
}
