package dev.barankiewicz.genderdiary.photos;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import android.util.Log;

import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;

import dev.barankiewicz.genderdiary.MainActivity;

import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;

import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Phase 9 audit ticket 06's pick channel, exercised end to end through the
 * real WebView: the registration this device's WebView gets, a token
 * redeemed for its exact bytes, a token nobody handed out refused, and the
 * measurement the ticket asks for - what a 25 MB scan costs the main thread
 * through each of the two transports.
 *
 * <p>Tokens are seeded with {@link PickedFiles} directly rather than by
 * driving a real pick: an instrumented test runs in the app's own process,
 * so it is the same static store {@code PhotosPlugin} writes to, and the
 * half this is about is everything after the file chooser closes.
 *
 * <p>Plain {@code evaluateJavascript} rather than a built probe bundle, for
 * the reason {@code PhotoWriteChannelTest} gives: this needs only the
 * WebView's own APIs and the plugins {@code MainActivity} already registers.
 *
 * <p><b>What it measured, on tracker35 (API 35 emulator, WebView 124),
 * 2026-09-06.</b> These are the ticket's before-and-after, kept here rather
 * than only in logcat so the next reader has the numbers without a device:
 *
 * <ul>
 *   <li>25 MB over the channel: 0.0ms decode, 91.6ms round trip.</li>
 *   <li>4 MB, both transports: 0.0ms against 257.3ms of decode, 25.3ms
 *       against 1040.3ms of round trip.</li>
 *   <li>25 MB through base64: does not complete. {@code encodeBase64}'s
 *       {@code toString("US-ASCII")} asks for 34 MB in one allocation
 *       against this emulator's 192 MB growth limit and the allocation
 *       fails, so the pick is refused rather than filed.</li>
 * </ul>
 *
 * <p>A phone's own figures will be better and are
 * {@code .scratch/pre-production-human-steps/04}'s to take; these are
 * enough to say which transport costs what.
 */
@RunWith(AndroidJUnit4.class)
public class PhotoPickChannelTest {
    private static final String TAG = "PhotoPickChannelTest";

    /** The ceiling documents/limits.ts sets, which is the size this ticket
        is about: a PDF is stored exactly as it arrived (ADR-0065), so a scan
        really does arrive at 25 MB. */
    private static final int CEILING = 25 * 1024 * 1024;

    /** A size both transports can complete, for the one test that compares
        them. See {@link #bothTransportsAtASizeTheFallbackSurvives}. */
    private static final int COMPARABLE = 4 * 1024 * 1024;

    @Test
    public void theChannelIsRegisteredOnAWebViewThatCanCarryIt() throws Exception {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            assertTrue(
                "androidPhotoPickChannel did not become available",
                awaitBoolean(scenario, "typeof window.androidPhotoPickChannel !== 'undefined'"));
        }
    }

    @Test
    public void aTokenComesBackAsTheExactBytesItWasHeldFor() throws Exception {
        String token = hold(new byte[] { 1, 2, 3, 4, 5 });

        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            String script =
                "(function(){"
                    + "  var channel = new MessageChannel();"
                    + "  channel.port1.onmessage = function(e){"
                    + "    if (typeof e.data === 'string') {"
                    + "      window.__pickChannelTestResult = JSON.stringify({stage:'error',reply:e.data});"
                    + "      return;"
                    + "    }"
                    + "    var bytes = new Uint8Array(e.data);"
                    + "    window.__pickChannelTestResult = JSON.stringify("
                    + "      {stage:'bytes',length:bytes.length,first:bytes[0],last:bytes[bytes.length-1]});"
                    + "  };"
                    + "  window.androidPhotoPickChannel.postMessage("
                    + "    JSON.stringify({token:'" + token + "'}), [channel.port2]);"
                    + "})();";

            JSONObject result = new JSONObject(awaitTestResult(scenario, script));

            assertEquals("bytes", result.getString("stage"));
            assertEquals(5, result.getInt("length"));
            assertEquals(1, result.getInt("first"));
            assertEquals(5, result.getInt("last"));
        }
    }

    /** A token from a pick that has already been read, or from one the app
        replaced, must say so rather than answer with somebody else's bytes. */
    @Test
    public void anUnknownTokenIsRefused() throws Exception {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            String script =
                "(function(){"
                    + "  var channel = new MessageChannel();"
                    + "  channel.port1.onmessage = function(e){"
                    + "    window.__pickChannelTestResult = typeof e.data === 'string'"
                    + "      ? e.data : JSON.stringify({ok:true,unexpected:'bytes'});"
                    + "  };"
                    + "  window.androidPhotoPickChannel.postMessage("
                    + "    JSON.stringify({token:'not-a-token'}), [channel.port2]);"
                    + "})();";

            JSONObject reply = new JSONObject(awaitTestResult(scenario, script));

            assertFalse(reply.getBoolean("ok"));
            assertEquals("unknown picked file", reply.getString("error"));
        }
    }

    /**
     * The ticket's acceptance figure: a 25 MB scan - what a document really
     * weighs, since a PDF is stored exactly as it arrived (ADR-0065) - over
     * the channel, timing the synchronous span that blocks the main thread
     * apart from the whole round trip. Both numbers reach logcat under
     * {@code PhotoPickChannelTest}, which is the only place they can be read
     * from.
     *
     * <p>The decode is a no-op by construction: a {@code Uint8Array} over a
     * transferred {@code ArrayBuffer} copies nothing. That is the whole
     * reason the transport was changed rather than the decode optimised, and
     * a figure anywhere near the bound below would mean something is copying
     * that should not be.
     *
     * <p>The base64 leg is deliberately not here. At this size it does not
     * finish on this emulator at all - {@code encodeBase64}'s
     * {@code toString("US-ASCII")} asks for a 34 MB String against a 192 MB
     * heap cap and the allocation fails - which is the peak-memory half of
     * the finding rather than an alternative to time it against. Unchanged
     * from before this ticket, on the same code, except that it is now only
     * the older WebViews' path instead of everyone's.
     * {@link #bothTransportsAtASizeTheFallbackSurvives} is the comparison.
     */
    @Test
    public void aTwentyFiveMegabyteFileCostsTheMainThreadNothingOverTheChannel() throws Exception {
        String token = hold(payload(CEILING));

        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            JSONObject report = new JSONObject(awaitCostReport(scenario, channelCostScript(token), 180));

            assertFalse("the channel reported " + report.optString("error"), report.has("error"));
            assertEquals(CEILING, report.getInt("length"));

            double decode = report.getDouble("decodeMs");
            Log.i(
                TAG,
                String.format(
                    "25MB picked file over the channel: decode %.1fms, round trip %.1fms",
                    decode, report.getDouble("totalMs")));

            assertTrue(
                "the channel's decode blocked the main thread for " + decode + "ms", decode < 250);
        }
    }

    /**
     * The before-and-after, at a size the base64 fallback can still complete:
     * the same bytes fetched over each transport, with the blocking span of
     * each logged. Four megabytes rather than the ceiling for the reason the
     * test above gives - the fallback runs out of heap before it runs out of
     * time.
     */
    @Test
    public void bothTransportsAtASizeTheFallbackSurvives() throws Exception {
        /* One hold, two tokens: a second hold() would replace the first
           batch, which is the bound PickedFiles is documented to have - and
           two tokens from one hold is what a multi-pick looks like anyway. */
        byte[] bytes = payload(COMPARABLE);
        List<String> tokens =
            PickedFiles.hold(Arrays.asList(PickedFiles.ofBytes(bytes), PickedFiles.ofBytes(bytes)));

        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            String script =
                "(function(){"
                    + "  var report = {};"
                    + "  var channel = new MessageChannel();"
                    + "  var sent = performance.now();"
                    + "  channel.port1.onmessage = function(e){"
                    + "    if (typeof e.data === 'string') {"
                    + "      window.__pickChannelCostResult = JSON.stringify({error:e.data});"
                    + "      return;"
                    + "    }"
                    + "    var decodeStart = performance.now();"
                    + "    var bytes = new Uint8Array(e.data);"
                    + "    var length = bytes.length;"
                    + "    report.channelDecodeMs = performance.now() - decodeStart;"
                    + "    report.channelTotalMs = performance.now() - sent;"
                    + "    report.channelLength = length;"
                    + "    var asked = performance.now();"
                    + "    window.Capacitor.Plugins.Photos.readPickedBase64({token:'" + tokens.get(1) + "'})"
                    + "      .then(function(res){"
                    + "        var start = performance.now();"
                    + "        var decoded = Uint8Array.from(atob(res.base64), function(c){ return c.charCodeAt(0); });"
                    + "        report.base64DecodeMs = performance.now() - start;"
                    + "        report.base64TotalMs = performance.now() - asked;"
                    + "        report.base64Length = decoded.length;"
                    + "        window.__pickChannelCostResult = JSON.stringify(report);"
                    + "      })"
                    + "      .catch(function(err){"
                    + "        window.__pickChannelCostResult = JSON.stringify({error:String(err)});"
                    + "      });"
                    + "  };"
                    + "  window.androidPhotoPickChannel.postMessage("
                    + "    JSON.stringify({token:'" + tokens.get(0) + "'}), [channel.port2]);"
                    + "})();";

            JSONObject report =
                new JSONObject(awaitCostReport(scenario, script, 180));

            assertFalse("the transports reported " + report.optString("error"), report.has("error"));
            assertEquals(COMPARABLE, report.getInt("channelLength"));
            assertEquals(COMPARABLE, report.getInt("base64Length"));

            double channelDecode = report.getDouble("channelDecodeMs");
            double base64Decode = report.getDouble("base64DecodeMs");
            Log.i(
                TAG,
                String.format(
                    "%dMB picked file: channel decode %.1fms (round trip %.1fms), base64 decode %.1fms (round trip %.1fms)",
                    COMPARABLE / (1024 * 1024),
                    channelDecode,
                    report.getDouble("channelTotalMs"),
                    base64Decode,
                    report.getDouble("base64TotalMs")));

            assertTrue(
                "base64 decode (" + base64Decode + "ms) was not slower than the channel's ("
                    + channelDecode + "ms), so this is not measuring what it thinks",
                base64Decode > channelDecode);
        }
    }

    /** Not a constant pattern: a run of one repeated byte would let base64
        and the transport both compress in ways a real scan does not. */
    private static byte[] payload(int size) {
        byte[] bytes = new byte[size];
        for (int i = 0; i < bytes.length; i++) bytes[i] = (byte) (i % 251);
        return bytes;
    }

    /** Fetches one token over the channel and reports what the decode and
        the round trip cost. */
    private static String channelCostScript(String token) {
        return "(function(){"
            + "  var channel = new MessageChannel();"
            + "  var sent = performance.now();"
            + "  channel.port1.onmessage = function(e){"
            + "    if (typeof e.data === 'string') {"
            + "      window.__pickChannelCostResult = JSON.stringify({error:e.data});"
            + "      return;"
            + "    }"
            + "    var decodeStart = performance.now();"
            + "    var bytes = new Uint8Array(e.data);"
            + "    var length = bytes.length;"
            + "    var decodeMs = performance.now() - decodeStart;"
            + "    window.__pickChannelCostResult = JSON.stringify("
            + "      {decodeMs:decodeMs,totalMs:performance.now() - sent,length:length});"
            + "  };"
            + "  window.androidPhotoPickChannel.postMessage("
            + "    JSON.stringify({token:'" + token + "'}), [channel.port2]);"
            + "})();";
    }

    private static String hold(byte[] payload) {
        return PickedFiles.hold(Collections.singletonList(PickedFiles.ofBytes(payload))).get(0);
    }

    /** Named for the global it polls rather than overloaded on arity: the
        two scripts report into different globals, and a timeout argument is
        no way to say which. */
    private String awaitTestResult(ActivityScenario<MainActivity> scenario, String script)
        throws InterruptedException {
        return awaitResult(scenario, script, "window.__pickChannelTestResult", 30);
    }

    private String awaitCostReport(ActivityScenario<MainActivity> scenario, String script, int timeoutSeconds)
        throws InterruptedException {
        return awaitResult(scenario, script, "window.__pickChannelCostResult", timeoutSeconds);
    }

    /** Runs {@code script}, then polls {@code resultExpression} - a JS string, so
        its evaluateJavascript reply is JSON-quoted one level deeper than it was
        written - until it is set. */
    private String awaitResult(
        ActivityScenario<MainActivity> scenario, String script, String resultExpression, int timeoutSeconds)
        throws InterruptedException {
        scenario.onActivity(activity -> activity.getBridge().getWebView().evaluateJavascript(script, null));

        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(timeoutSeconds);
        while (System.nanoTime() < deadline) {
            String value = unquote(evaluateRaw(scenario, "(" + resultExpression + ") || ''"));
            if (value != null && !value.isEmpty()) return value;
            Thread.sleep(200);
        }
        throw new AssertionError("the pick channel did not report within " + timeoutSeconds + "s");
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
