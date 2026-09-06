package dev.engender.app.reset;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * The reset's third call from the WebView (phase 5 security ticket 01).
 * The other two are the journal itself and belong to the plugins that made
 * it - Sqlite deletes the database, Keystore erases the wrapped data key.
 * This one is {@link DeviceStores}, which is everything else.
 */
@CapacitorPlugin(name = "DeviceReset")
public class DeviceResetPlugin extends Plugin {

    @PluginMethod
    public void wipe(PluginCall call) {
        try {
            DeviceStores.wipe(getContext());
            call.resolve();
        } catch (Exception e) {
            call.reject(message(e), e);
        }
    }

    private static String message(Exception e) {
        String detail = e.getMessage();
        return detail == null || detail.isEmpty() ? e.getClass().getName() : detail;
    }
}
