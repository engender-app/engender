package dev.barankiewicz.genderdiary.quickexit;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import android.content.Context;

import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import dev.barankiewicz.genderdiary.MainActivity;

import org.json.JSONArray;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Ticket 15's second acceptance box, on a device: whether the deliberate
 * "leave the app" gesture (Home, Recents - MainActivity.onUserLeaveHint)
 * actually reaches the app's own quickExit(), not whether quickExit() then
 * does the right thing (that's lock.svelte.ts's own tests). The risk this
 * covers is the plumbing, not the policy: the web app's
 * blur/visibilitychange listeners only run once the WebView's event loop
 * gets to them, which is exactly the "visible pause" this ticket's second
 * box rules out, so onUserLeaveHint calls straight into
 * window.__quickExitFromNative instead. Proved by watching that call
 * happen (or not), rather than trusting the source reads synchronously.
 */
@RunWith(AndroidJUnit4.class)
public class QuickExitLeaveHintTest {

    private static final long TIMEOUT_SECONDS = 60;
    private static final String PREFS = "gender-diary-quick-exit";

    @Before
    public void setUp() {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().clear().commit();
    }

    @Test
    public void leavingTheAppCallsTheHookWhenQuickExitIsOn() throws Exception {
        setQuickExitEnabled(true);

        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            awaitTrue(scenario, "typeof window.__quickExitFromNative === 'function'");
            installCounter(scenario);

            long startedAt = System.nanoTime();
            scenario.onActivity(MainActivity::onUserLeaveHint);
            assertEquals("1", awaitJs(scenario, "String(window.__quickExitCalls || 0)", "1"));
            long elapsedMs = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - startedAt);
            assertTrue("quick exit took too long: " + elapsedMs + "ms", elapsedMs < 1500);
        }
    }

    @Test
    public void leavingTheAppDoesNothingWhenQuickExitIsOff() throws Exception {
        setQuickExitEnabled(false);

        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            awaitTrue(scenario, "typeof window.__quickExitFromNative === 'function'");
            installCounter(scenario);

            scenario.onActivity(MainActivity::onUserLeaveHint);
            Thread.sleep(2000); // long enough for a call that was going to happen to have happened

            assertEquals("0", evalJs(scenario, "String(window.__quickExitCalls || 0)"));
        }
    }

    private void setQuickExitEnabled(boolean enabled) {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putBoolean("enabled", enabled).apply();
    }

    /** Wraps the app's own hook so a call through it is observable, without
        replacing what it does - a spy, not a stub, because a stub here
        would only prove that the wiring exists, not that the real
        quickExit() got a chance to run. */
    private void installCounter(ActivityScenario<MainActivity> scenario) throws Exception {
        runJs(
            scenario,
            "window.__quickExitCalls = 0;"
                + "var original = window.__quickExitFromNative;"
                + "window.__quickExitFromNative = function() { window.__quickExitCalls++; original(); };"
        );
    }

    private void awaitTrue(ActivityScenario<MainActivity> scenario, String expression) throws Exception {
        awaitJs(scenario, "String(!!(" + expression + "))", "true");
    }

    /** Polls until {@code expression} evaluates to {@code expected}, or fails
        after {@link #TIMEOUT_SECONDS}. */
    private String awaitJs(ActivityScenario<MainActivity> scenario, String expression, String expected)
        throws Exception {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(TIMEOUT_SECONDS);
        String last = null;
        while (System.nanoTime() < deadline) {
            last = evalJs(scenario, expression);
            if (expected == null || expected.equals(last)) return last;
            Thread.sleep(200);
        }
        throw new AssertionError("timed out waiting for `" + expression + "` to be `" + expected + "`, last saw `" + last + "`");
    }

    private void runJs(ActivityScenario<MainActivity> scenario, String script) throws Exception {
        evalJs(scenario, script);
    }

    private String evalJs(ActivityScenario<MainActivity> scenario, String script) throws Exception {
        AtomicReference<String> value = new AtomicReference<>();
        CountDownLatch evaluated = new CountDownLatch(1);

        scenario.onActivity(
            activity ->
                activity
                    .getBridge()
                    .getWebView()
                    .evaluateJavascript(
                        script,
                        answer -> {
                            value.set(answer);
                            evaluated.countDown();
                        }));

        if (!evaluated.await(30, TimeUnit.SECONDS)) throw new AssertionError("the WebView stopped answering");
        return unquote(value.get());
    }

    private static String unquote(String evaluated) {
        if (evaluated == null || evaluated.equals("null")) return null;
        try {
            return new JSONArray("[" + evaluated + "]").getString(0);
        } catch (Exception e) {
            return evaluated;
        }
    }
}
