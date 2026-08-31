package dev.barankiewicz.genderdiary.keystore;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * The bridge half of ticket sec-02-06: {@link PinBindingKeystore} as three
 * calls that {@code src/lib/data/device-secret.ts} reads.
 *
 * <p>The key never crosses this bridge and cannot - Keystore does not hand
 * out key material - so what crosses is one signature over the label the
 * caller names. The label is versioned and lives in the web module rather
 * than here, so a later scheme can derive a different secret from the same
 * key without a native change.
 *
 * <p>A missing key comes back as an answer rather than as a rejection: a
 * cleared alias is a state PIN mode has copy for ("this phone no longer holds
 * the device key this PIN was bound to"), and it must not arrive at the gate
 * as a wrong PIN or as a boot failure.
 */
@CapacitorPlugin(name = "PinBinding")
public class PinBindingPlugin extends Plugin {

    /** First run of PIN mode: mints the key and signs the label with it. */
    @PluginMethod
    public void create(PluginCall call) {
        String label = call.getString("label");
        if (label == null || label.isEmpty()) {
            call.reject("a PIN binding needs a label to sign");
            return;
        }
        try {
            call.resolve(secret(PinBindingKeystore.create(label)));
        } catch (Exception e) {
            call.reject(message(e), e);
        }
    }

    /** Every later unlock. No secret in the answer when the alias is gone. */
    @PluginMethod
    public void read(PluginCall call) {
        String label = call.getString("label");
        if (label == null || label.isEmpty()) {
            call.reject("a PIN binding needs a label to sign");
            return;
        }
        try {
            call.resolve(secret(PinBindingKeystore.read(label)));
        } catch (Exception e) {
            call.reject(message(e), e);
        }
    }

    /** The reset path, and a move out of PIN mode. */
    @PluginMethod
    public void erase(PluginCall call) {
        try {
            PinBindingKeystore.erase();
            call.resolve();
        } catch (Exception e) {
            call.reject(message(e), e);
        }
    }

    private static JSObject secret(String signature) {
        JSObject result = new JSObject();
        /* Left out rather than sent as null when there is no key: JSON has
           no distinction the WebView side needs here, and device-secret.ts
           reads an absent secret and a null one as the same missing key. */
        if (signature != null) result.put("secret", signature);
        return result;
    }

    private static String message(Exception e) {
        String detail = e.getMessage();
        return detail == null || detail.isEmpty() ? e.getClass().getName() : detail;
    }
}
