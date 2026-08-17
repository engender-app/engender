package dev.barankiewicz.genderdiary.photos;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;

import dev.barankiewicz.genderdiary.MainActivity;

import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Ticket 19's write channel, exercised end to end through the real WebView:
 * the registration this device's WebView gets, a write landing on disk where
 * the plugin's own {@code sizeFile}/{@code directoryPath} calls can see it,
 * and a path-traversal name rejected rather than silently written somewhere
 * unexpected - the one failure mode the ticket's "watch out for" section
 * names explicitly, on the one operation the user has no other copy of.
 *
 * <p>Plain {@code evaluateJavascript} rather than a built probe bundle
 * (unlike {@code LongJournalBenchmarkTest}/{@code JournalContractTest}):
 * this only needs the WebView's own APIs and the plugins {@code MainActivity}
 * already registers, so there is nothing here for a bundle to add.
 */
@RunWith(AndroidJUnit4.class)
public class PhotoWriteChannelTest {

    @Test
    public void theChannelIsRegisteredOnAWebViewThatCanCarryIt() throws Exception {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            assertTrue(
                "androidPhotoWriteChannel did not become available",
                awaitBoolean(scenario, "typeof window.androidPhotoWriteChannel !== 'undefined'"));
        }
    }

    @Test
    public void writesThroughTheChannelAndTheBytesAreReadableAfter() throws Exception {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            String script =
                "(function(){"
                    + "  var bytes = new Uint8Array([1,2,3,4,5]);"
                    + "  var channel = new MessageChannel();"
                    + "  channel.port1.onmessage = function(e){"
                    + "    var ack = JSON.parse(e.data);"
                    + "    if (!ack.ok) { window.__writeChannelTestResult = JSON.stringify({stage:'write',ack:ack}); return; }"
                    + "    window.Capacitor.Plugins.Photos.sizeFile({name:'write-channel-probe.bin',directory:'write-channel-test'})"
                    + "      .then(function(res){ window.__writeChannelTestResult = JSON.stringify({stage:'sizeFile',size:res.size}); })"
                    + "      .catch(function(err){ window.__writeChannelTestResult = JSON.stringify({stage:'sizeFile',error:String(err)}); });"
                    + "  };"
                    + "  window.androidPhotoWriteChannel.postMessage("
                    + "    JSON.stringify({name:'write-channel-probe.bin',directory:'write-channel-test'}), [channel.port2]);"
                    + "  channel.port1.postMessage(bytes.buffer, [bytes.buffer]);"
                    + "})();";

            String raw = awaitResult(scenario, script, "window.__writeChannelTestResult");
            JSONObject result = new JSONObject(raw);

            assertEquals("sizeFile", result.getString("stage"));
            assertEquals(5, result.getInt("size"));
        }
    }

    @Test
    public void aPathTraversalNameIsRejectedOverTheChannel() throws Exception {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            String script =
                "(function(){"
                    + "  var bytes = new Uint8Array([1]);"
                    + "  var channel = new MessageChannel();"
                    + "  channel.port1.onmessage = function(e){"
                    + "    window.__writeChannelTestResult = e.data;"
                    + "  };"
                    + "  window.androidPhotoWriteChannel.postMessage("
                    + "    JSON.stringify({name:'../escaped.bin',directory:'write-channel-test'}), [channel.port2]);"
                    + "  channel.port1.postMessage(bytes.buffer, [bytes.buffer]);"
                    + "})();";

            String raw = awaitResult(scenario, script, "window.__writeChannelTestResult");
            JSONObject ack = new JSONObject(raw);

            assertEquals(false, ack.getBoolean("ok"));
        }
    }

    /** Runs {@code script}, then polls {@code resultExpression} - a JS string, so
        its evaluateJavascript reply is JSON-quoted one level deeper than it was
        written - until it is set. */
    private String awaitResult(ActivityScenario<MainActivity> scenario, String script, String resultExpression)
        throws InterruptedException {
        scenario.onActivity(activity -> activity.getBridge().getWebView().evaluateJavascript(script, null));

        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(30);
        while (System.nanoTime() < deadline) {
            String value = unquote(evaluateRaw(scenario, "(" + resultExpression + ") || ''"));
            if (value != null && !value.isEmpty()) return value;
            Thread.sleep(200);
        }
        throw new AssertionError("the write channel did not report within 30s");
    }

    /** Polls a boolean-valued expression until it becomes true or the deadline passes. */
    private boolean awaitBoolean(ActivityScenario<MainActivity> scenario, String expression) throws InterruptedException {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(30);
        while (System.nanoTime() < deadline) {
            if ("true".equals(evaluateRaw(scenario, expression))) return true;
            Thread.sleep(200);
        }
        return false;
    }

    /** The raw evaluateJavascript reply: `"true"`/`"false"` for a boolean
        expression, a JSON-quoted string for a string one. */
    private String evaluateRaw(ActivityScenario<MainActivity> scenario, String expression) throws InterruptedException {
        AtomicReference<String> value = new AtomicReference<>();
        CountDownLatch evaluated = new CountDownLatch(1);

        scenario.onActivity(
            activity ->
                activity
                    .getBridge()
                    .getWebView()
                    .evaluateJavascript(
                        expression,
                        result -> {
                            value.set(result);
                            evaluated.countDown();
                        }));

        if (!evaluated.await(10, TimeUnit.SECONDS)) {
            throw new AssertionError("the WebView stopped answering");
        }
        return value.get();
    }

    /** evaluateJavascript hands back a JSON-encoded value, so a string result
        arrives quoted and escaped one level deeper than it was written. */
    private static String unquote(String evaluated) {
        if (evaluated == null || evaluated.equals("null") || evaluated.equals("\"\"")) return null;
        try {
            return new org.json.JSONArray("[" + evaluated + "]").getString(0);
        } catch (Exception e) {
            return null;
        }
    }
}
