package dev.engender.app.webview;

import android.app.Activity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebView;

import androidx.test.core.app.ActivityScenario;
import androidx.test.platform.app.InstrumentationRegistry;

import org.json.JSONObject;
import org.json.JSONArray;
import org.json.JSONException;

import dev.engender.app.MainActivity;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Reading a value out of the app's own WebView from an instrumentation test.
 *
 * <p>Extracted when a second test needed it. WebViewPrintAdapterTest had
 * grown a poll-evaluate-compare loop of its own,
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
    private int nextCall;

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
        // Dispatch on the main thread so animated screens cannot block on global UI idleness.
        InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> scenario.onActivity(
            activity ->
                webView(activity).evaluateJavascript(
                    expression,
                    result -> {
                        value.set(result);
                        evaluated.countDown();
                    })));
        if (!evaluated.await(ANSWER_TIMEOUT_SECONDS, TimeUnit.SECONDS)) {
            throw new AssertionError("the WebView stopped answering");
        }
        return value.get();
    }

    /** Finds the app WebView through framework APIs that remain in an optimized release. */
    public static WebView webView(Activity activity) {
        WebView view = findWebView(activity.getWindow().getDecorView());
        if (view == null) throw new AssertionError("the activity has no WebView");
        return view;
    }

    private static WebView findWebView(View root) {
        if (root instanceof WebView) return (WebView) root;
        if (root instanceof ViewGroup) {
            ViewGroup group = (ViewGroup) root;
            for (int i = 0; i < group.getChildCount(); i++) {
                WebView found = findWebView(group.getChildAt(i));
                if (found != null) return found;
            }
        }
        return null;
    }

    /** Loads a local probe through Capacitor's existing same-origin file handler. */
    public void loadFile(String path) throws InterruptedException {
        awaitTrue("!!window.Capacitor && typeof window.Capacitor.convertFileSrc === 'function'");
        String url = string(evaluate("window.Capacitor.convertFileSrc(" + JSONObject.quote(path) + ")"));
        if (url == null || url.isEmpty()) throw new AssertionError("Capacitor did not resolve the probe file");
        scenario.onActivity(activity -> webView(activity).loadUrl(url));
    }

    /** Starts a production plugin call without waiting for its native answer. */
    public String startCall(String plugin, String method, JSONObject arguments) throws InterruptedException {
        awaitTrue("!!window.Capacitor && !!window.Capacitor.Plugins && !!window.Capacitor.Plugins[" + JSONObject.quote(plugin) + "]");
        String id = "call" + ++nextCall;
        evaluate("window.__nativeTestCalls = window.__nativeTestCalls || {};"
            + "window.__nativeTestCalls[" + JSONObject.quote(id) + "] = {state:'pending'};"
            + "window.Capacitor.Plugins[" + JSONObject.quote(plugin) + "][" + JSONObject.quote(method) + "](" + arguments + ")"
            + ".then(function(result){window.__nativeTestCalls[" + JSONObject.quote(id) + "]={state:'resolved',result:result};},"
            + "function(error){window.__nativeTestCalls[" + JSONObject.quote(id) + "]={state:'rejected',error:{message:error.message,code:error.code}};});true");
        return id;
    }

    /** Waits within the probe deadline, preserving both native results and rejections. */
    public JSONObject awaitCall(String id) throws InterruptedException, JSONException {
        awaitTrue("window.__nativeTestCalls[" + JSONObject.quote(id) + "].state !== 'pending'");
        String encoded = evaluate("JSON.stringify(window.__nativeTestCalls[" + JSONObject.quote(id) + "])");
        return new JSONObject(new JSONArray("[" + encoded + "]").getString(0));
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
