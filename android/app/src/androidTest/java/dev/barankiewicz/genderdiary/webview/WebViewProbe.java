package dev.barankiewicz.genderdiary.webview;

import androidx.test.core.app.ActivityScenario;

import dev.barankiewicz.genderdiary.MainActivity;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Reading a value out of the app's own WebView from an instrumentation test.
 *
 * <p>Extracted when a second test needed it (phase 5 security ticket 03).
 * WebViewPrintAdapterTest had grown a poll-evaluate-compare loop of its own,
 * and the CSP test copied it verbatim, strings and 250ms interval included. A
 * third copy was the next thing to happen, so it lives here instead.
 *
 * <p>Polling rather than a JavascriptInterface, which is the choice worth
 * keeping: a probe that publishes to `window` is a plain module, which is what
 * lets the browser tier read the same probe the same way.
 */
public final class WebViewProbe {

    /** How often to ask again. Fast enough not to add visible latency. */
    private static final long POLL_MILLIS = 250;

    /** How long one evaluateJavascript call may take before the WebView counts as dead. */
    private static final long ANSWER_TIMEOUT_SECONDS = 10;

    private final ActivityScenario<MainActivity> scenario;
    private final long timeoutSeconds;

    public WebViewProbe(ActivityScenario<MainActivity> scenario, long timeoutSeconds) {
        this.scenario = scenario;
        this.timeoutSeconds = timeoutSeconds;
    }

    /**
     * Evaluates {@code expression} once and returns what it produced, as the
     * JSON evaluateJavascript hands back - so a string arrives quoted.
     */
    public String evaluate(String expression) throws InterruptedException {
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
        if (!evaluated.await(ANSWER_TIMEOUT_SECONDS, TimeUnit.SECONDS)) {
            throw new AssertionError("the WebView stopped answering");
        }
        return value.get();
    }

    /** Polls {@code expression} until it equals {@code wanted}, then returns what it last saw. */
    public String awaitValue(String expression, String wanted) throws InterruptedException {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(timeoutSeconds);
        String seen = null;
        while (System.nanoTime() < deadline) {
            seen = evaluate(expression);
            if (wanted.equals(seen)) return seen;
            Thread.sleep(POLL_MILLIS);
        }
        return seen;
    }

    /** Waits for {@code expression} to be true, and fails naming it if it never is. */
    public void awaitTrue(String expression) throws InterruptedException {
        String seen = awaitValue(expression, "true");
        if (!"true".equals(seen)) {
            throw new AssertionError("never became true: " + expression + " (last saw " + seen + ")");
        }
    }

    /** A JSON string as its value, or null for JSON {@code null}. */
    public static String string(String json) {
        if (json == null || "null".equals(json)) return null;
        return json.startsWith("\"") ? json.substring(1, json.length() - 1) : json;
    }
}
