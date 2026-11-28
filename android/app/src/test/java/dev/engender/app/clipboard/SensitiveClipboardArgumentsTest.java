package dev.engender.app.clipboard;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;
import org.json.JSONException;
import org.junit.Test;

/**
 * The copy call as the bridge hands it over. The WebView posts the call as
 * JSON text and MessageHandler.postMessage parses it with org.json, so a
 * number arrives as whatever type the parser picked for it: 60000, the
 * interval the recovery key screen sends, is an Integer. Building the
 * PluginCall from that same text is the point - a test that put a Long into
 * the call by hand would pass against a reader that every real call defeats.
 */
public class SensitiveClipboardArgumentsTest {

    /** What @capacitor/android's native-bridge.js posts for
        sensitiveClipboard.copy({ value, clearAfterMs: 60_000 }). */
    private static PluginCall bridgeCall(String options) throws JSONException {
        JSObject message = new JSObject(
            "{\"callbackId\":\"1\",\"pluginId\":\"SensitiveClipboard\",\"methodName\":\"copy\",\"options\":"
                + options
                + "}"
        );
        // MessageHandler.postMessage's own two steps.
        JSObject methodData = message.getJSObject("options", new JSObject());
        return new PluginCall(null, "SensitiveClipboard", "1", "copy", methodData);
    }

    @Test
    public void readsTheIntervalTheRecoveryKeyScreenSends() throws JSONException {
        PluginCall call = bridgeCall("{\"value\":\"K7QF-2M9X-BTRW-4HDC-8PNZ\",\"clearAfterMs\":60000}");

        assertEquals(Long.valueOf(60_000L), SensitiveClipboardPlugin.clearAfterMs(call));
    }

    @Test
    public void readsAnIntervalTooLongForAnInteger() throws JSONException {
        PluginCall call = bridgeCall("{\"value\":\"K\",\"clearAfterMs\":3000000000}");

        assertEquals(Long.valueOf(3_000_000_000L), SensitiveClipboardPlugin.clearAfterMs(call));
    }

    @Test
    public void hasNoIntervalWhenTheCallSendsNone() throws JSONException {
        assertNull(SensitiveClipboardPlugin.clearAfterMs(bridgeCall("{\"value\":\"K\"}")));
        assertNull(SensitiveClipboardPlugin.clearAfterMs(bridgeCall("{\"value\":\"K\",\"clearAfterMs\":\"60000\"}")));
    }

    @Test
    public void refusesAnIntervalThatWouldBeTruncatedOrWrapped() throws JSONException {
        assertNull(SensitiveClipboardPlugin.clearAfterMs(bridgeCall("{\"value\":\"K\",\"clearAfterMs\":60000.5}")));
        assertNull(SensitiveClipboardPlugin.clearAfterMs(bridgeCall("{\"value\":\"K\",\"clearAfterMs\":-18446744073709551615}")));
    }
}
