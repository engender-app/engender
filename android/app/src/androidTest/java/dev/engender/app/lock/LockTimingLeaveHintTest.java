package dev.engender.app.lock;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import android.content.Context;

import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import dev.engender.app.MainActivity;

import org.json.JSONArray;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

/** Checks that Home/Recents reaches the real lock hook only under Immediately.
 * The preference is mirrored through the same public bridge as Settings.
 */
@RunWith(AndroidJUnit4.class)
public class LockTimingLeaveHintTest {

    private static final long TIMEOUT_SECONDS = 60;
    private static final String PREFS = LockTimingPlugin.PREFS;

    @Before
    public void setUp() {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().clear().commit();
    }

    @Test
    public void leavingTheAppCallsTheHookOnlyUnderImmediately() throws Exception {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            awaitTrue(scenario, "typeof window.__lockOnLeaveFromNative === 'function'");
            setTiming(scenario, "immediately");
            installCounter(scenario);

            long startedAt = System.nanoTime();
            scenario.onActivity(MainActivity::onUserLeaveHint);
            assertEquals("1", awaitJs(scenario, "String(window.__leaveLockCalls || 0)", "1"));
            long elapsedMs = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - startedAt);
            assertTrue("leave lock took too long: " + elapsedMs + "ms", elapsedMs < 1500);
        }
    }

    @Test
    public void leavingTheAppDoesNothingUnderOtherTimings() throws Exception {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            awaitTrue(scenario, "typeof window.__lockOnLeaveFromNative === 'function'");
            installCounter(scenario);
            for (String timing : new String[] {"one-minute", "five-minutes", "restart"}) {
                setTiming(scenario, timing);
                scenario.onActivity(MainActivity::onUserLeaveHint);
                scenario.onActivity(MainActivity::onPause);
                if (android.os.Build.VERSION.SDK_INT >= 29) {
                    scenario.onActivity(activity -> activity.onTopResumedActivityChanged(false));
                }
                Thread.sleep(500);
                assertEquals(timing, "0", evalJs(scenario, "String(window.__leaveLockCalls || 0)"));
                scenario.onActivity(MainActivity::onResume);
            }
        }
    }

    @Test
    @androidx.test.filters.SdkSuppress(minSdkVersion = 29)
    public void recentsLocksWhileResumedAndRestoresTheCaptureChoice() throws Exception {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            awaitTrue(scenario, "typeof window.__lockOnLeaveFromNative === 'function'");
            setTiming(scenario, "immediately");
            installCounter(scenario);
            for (boolean allowed : new boolean[] {true, false}) {
                InstrumentationRegistry.getInstrumentation().getTargetContext()
                    .getSharedPreferences(dev.engender.app.screencapture.ScreenCapturePlugin.PREFS, Context.MODE_PRIVATE)
                    .edit().putBoolean("allowed", allowed).commit();
                runJs(scenario, "window.__leaveLockCalls = 0");
                scenario.onActivity(activity -> activity.onTopResumedActivityChanged(false));
                assertEquals("1", awaitJs(scenario, "String(window.__leaveLockCalls || 0)", "1"));
                scenario.onActivity(activity -> assertTrue(
                    (activity.getWindow().getAttributes().flags & android.view.WindowManager.LayoutParams.FLAG_SECURE) != 0
                ));
                scenario.onActivity(activity -> activity.onTopResumedActivityChanged(true));
                scenario.onActivity(activity -> assertEquals(
                    !allowed,
                    (activity.getWindow().getAttributes().flags & android.view.WindowManager.LayoutParams.FLAG_SECURE) != 0
                ));
            }
        }
    }

    @Test
    public void recentsPauseLocksWithoutALeaveHintAndProtectsTheThumbnail() throws Exception {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            awaitTrue(scenario, "typeof window.__lockOnLeaveFromNative === 'function'");
            setTiming(scenario, "immediately");
            installCounter(scenario);
            scenario.onActivity(MainActivity::onPause);
            assertEquals("1", awaitJs(scenario, "String(window.__leaveLockCalls || 0)", "1"));
            scenario.onActivity(activity -> assertTrue(
                (activity.getWindow().getAttributes().flags & android.view.WindowManager.LayoutParams.FLAG_SECURE) != 0
            ));
            scenario.onActivity(MainActivity::onResume);
            scenario.onActivity(activity -> assertEquals(
                !dev.engender.app.screencapture.ScreenCapturePlugin.isAllowed(activity),
                (activity.getWindow().getAttributes().flags & android.view.WindowManager.LayoutParams.FLAG_SECURE) != 0
            ));
        }
    }

    private void setTiming(ActivityScenario<MainActivity> scenario, String timing) throws Exception {
        runJs(scenario, "window.Capacitor.Plugins.LockTiming.setTiming({timing: '" + timing + "'})");
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(TIMEOUT_SECONDS);
        while (System.nanoTime() < deadline) {
            if (timing.equals(context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("timing", null))) return;
            Thread.sleep(100);
        }
        throw new AssertionError("lock timing did not reach native preferences: " + timing);
    }

    /** Wraps the app's own hook so a call through it is observable, without
        replacing what it does - a spy, not a stub, because a stub here
        would only prove that the wiring exists, not that the real
        lockNow() got a chance to run. */
    private void installCounter(ActivityScenario<MainActivity> scenario) throws Exception {
        runJs(
            scenario,
            "window.__leaveLockCalls = 0;"
                + "var original = window.__lockOnLeaveFromNative;"
                + "window.__lockOnLeaveFromNative = function() { window.__leaveLockCalls++; original(); };"
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
