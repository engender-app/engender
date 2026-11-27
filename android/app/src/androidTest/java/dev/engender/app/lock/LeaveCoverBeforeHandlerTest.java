package dev.engender.app.lock;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.provider.MediaStore;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import dev.engender.app.MainActivity;
import dev.engender.app.webview.WebViewProbe;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

/**
 * A handler the app opens for a result is another app. The cover is up before
 * it can draw, stays up for as long as it is in front, and a handler that is
 * not a system component gets no lock grace.
 */
@RunWith(AndroidJUnit4.class)
public class LeaveCoverBeforeHandlerTest {
    private final Context app = InstrumentationRegistry.getInstrumentation().getTargetContext();
    private static final String[] ACTIONS = {
        MediaStore.ACTION_IMAGE_CAPTURE, Intent.ACTION_OPEN_DOCUMENT,
        Intent.ACTION_CREATE_DOCUMENT, Intent.ACTION_OPEN_DOCUMENT_TREE};

    @Before public void allowCamera() {
        // The camera intent is refused outright while the app's own CAMERA permission is revoked.
        InstrumentationRegistry.getInstrumentation().getUiAutomation()
            .grantRuntimePermission(app.getPackageName(), android.Manifest.permission.CAMERA);
    }

    @After public void tearDown() {
        LeaveCover.set(false, "#000000");
        LeaveCover.reveal();
    }

    private Intent handler(String action) {
        return new Intent(action).setComponent(new ComponentName(
            InstrumentationRegistry.getInstrumentation().getContext().getPackageName(), TranslucentHandlerActivity.class.getName()));
    }

    @Test public void theCoverIsUpBeforeEachHandlerDrawsAndStaysUpPastTheGrace() throws Exception {
        LeaveCover.set(true, "#101820");
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            for (String action : ACTIONS) {
                AtomicBoolean coveredWhenDrawn = new AtomicBoolean();
                AtomicBoolean coveredOnReturn = new AtomicBoolean();
                CountDownLatch drawn = new CountDownLatch(1);
                android.content.BroadcastReceiver drew = new android.content.BroadcastReceiver() {
                    @Override public void onReceive(Context context, Intent intent) {
                        coveredWhenDrawn.set(LeaveCover.isShown());
                        drawn.countDown();
                    }
                };
                androidx.core.content.ContextCompat.registerReceiver(app, drew,
                    new android.content.IntentFilter(TranslucentHandlerActivity.DREW), androidx.core.content.ContextCompat.RECEIVER_EXPORTED);
                scenario.onActivity(activity -> {
                    // The page mirrors "no secret" into the cover when it boots; pin the mirror for this call.
                    LeaveCover.set(true, "#101820");
                    activity.startActivityForResult(handler(action).putExtra("notify", app.getPackageName()), 77);
                    // Synchronously, before the activity manager has even been asked to pause this one.
                    coveredOnReturn.set(LeaveCover.isShown());
                });
                boolean arrived = drawn.await(15, TimeUnit.SECONDS);
                app.unregisterReceiver(drew);
                assertTrue("handler never drew for " + action, arrived);
                assertTrue("cover was not up when the call returned for " + action, coveredOnReturn.get());
                assertTrue("cover was not up when the handler drew for " + action, coveredWhenDrawn.get());
                if (action.equals(Intent.ACTION_OPEN_DOCUMENT_TREE)) {
                    Thread.sleep(62_000);
                    assertTrue("cover dropped while a handler was still in front", LeaveCover.isShown());
                }
                scenario.onActivity(activity -> {
                    // Finish the handler by hand: it is the top activity until then.
                    activity.finishActivity(77);
                });
                InstrumentationRegistry.getInstrumentation().waitForIdleSync();
                Thread.sleep(1500); // the page's own reveal for this return lands before the next launch
                scenario.onActivity(activity -> LeaveCover.reveal());
            }
        }
    }

    @Test public void aHandlerThatIsNotASystemComponentGetsNoLockGrace() throws Exception {
        LeaveCover.set(true, "#101820");
        String testPackage = InstrumentationRegistry.getInstrumentation().getContext().getPackageName();
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            WebViewProbe probe = new WebViewProbe(scenario, 60);
            for (String action : ACTIONS) {
                // The handler is an installed non-system app answering the implicit intent.
                Intent implicit = new Intent(action).addCategory(Intent.CATEGORY_DEFAULT).setPackage(testPackage);
                if (action.equals(Intent.ACTION_OPEN_DOCUMENT) || action.equals(Intent.ACTION_CREATE_DOCUMENT)) {
                    implicit.addCategory(Intent.CATEGORY_OPENABLE).setType("*/*");
                }
                assertEquals("reports for " + action, "false", leaveReport(scenario, probe, implicit));
            }
        }
    }

    @Test public void theSystemsOwnPickerKeepsTheGrace() throws Exception {
        LeaveCover.set(true, "#101820");
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            WebViewProbe probe = new WebViewProbe(scenario, 60);
            // The test package also answers this action (as a third-party handler would), so address the system's own.
            Intent system = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
            String systemPackage = null;
            for (android.content.pm.ResolveInfo found : app.getPackageManager().queryIntentActivities(system, android.content.pm.PackageManager.MATCH_DEFAULT_ONLY)) {
                if ((found.activityInfo.applicationInfo.flags & android.content.pm.ApplicationInfo.FLAG_SYSTEM) != 0) systemPackage = found.activityInfo.packageName;
            }
            assertTrue("no system app answers OPEN_DOCUMENT_TREE", systemPackage != null);
            system.setPackage(systemPackage);
            assertEquals("true", leaveReport(scenario, probe, system));
        }
    }

    @Test public void aThirdPartyAppAlsoAnsweringDoesNotCostTheSystemPickerItsGrace() throws Exception {
        LeaveCover.set(true, "#101820");
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            WebViewProbe probe = new WebViewProbe(scenario, 60);
            // No package: the system picker and the test package both answer, and the system resolves to its
            // own picker without a chooser, which is what a phone with a second camera app installed does.
            assertEquals("true", leaveReport(scenario, probe, new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE)));
        }
    }

    @Test public void theCoverFadesOutRatherThanCuttingWhenTheReturnLiftsIt() throws Exception {
        LeaveCover.set(true, "#101820");
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            java.util.List<Float> alphas = new java.util.concurrent.CopyOnWriteArrayList<>();
            CountDownLatch gone = new CountDownLatch(1);
            android.os.Handler main = new android.os.Handler(android.os.Looper.getMainLooper());
            scenario.onActivity(activity -> {
                LeaveCover.set(true, "#101820");
                activity.startActivityForResult(handler(Intent.ACTION_OPEN_DOCUMENT_TREE), 79);
                // Sample the cover on every frame from the launch on; the page's own reveal after the return
                // and the explicit one below land in the same series.
                android.view.Choreographer.FrameCallback sample = new android.view.Choreographer.FrameCallback() {
                    @Override public void doFrame(long frameTimeNanos) {
                        float alpha = activity.leaveCoverAlpha();
                        if (alpha == 1f || !alphas.isEmpty()) alphas.add(alpha);
                        if (alpha == 0f && alphas.size() > 1) gone.countDown();
                        else android.view.Choreographer.getInstance().postFrameCallback(this);
                    }
                };
                android.view.Choreographer.getInstance().postFrameCallback(sample);
            });
            Thread.sleep(1500);
            scenario.onActivity(activity -> activity.finishActivity(79));
            InstrumentationRegistry.getInstrumentation().waitForIdleSync();
            Thread.sleep(300);
            scenario.onActivity(activity -> activity.revealLeaveCover());
            assertTrue("the cover never came off: " + alphas, gone.await(8, TimeUnit.SECONDS));
            float largestStep = 0;
            for (int index = 1; index < alphas.size(); index++) largestStep = Math.max(largestStep, Math.abs(alphas.get(index - 1) - alphas.get(index)));
            assertTrue("a cut, not a fade: " + alphas, largestStep <= 0.5f);
            assertTrue("no intermediate frame: " + alphas, alphas.stream().anyMatch(a -> a > 0f && a < 1f));
        }
    }

    /** What the activity tells the page about a leave to {@code intent}: the argument of __lockOnLeaveFromNative. */
    private String leaveReport(ActivityScenario<MainActivity> scenario, WebViewProbe probe, Intent intent) throws Exception {
        // The page installs its own hook when it boots, so a plain assignment can lose that race: pin ours.
        probe.evaluate("window.__reports = []; Object.defineProperty(window, '__lockOnLeaveFromNative', {configurable: true,"
            + " get: function () { return function (own) { window.__reports.push(String(own)); }; }, set: function () {}}); 1");
        scenario.onActivity(activity -> activity.startActivityForResult(intent, 78));
        String reports = "\"\"";
        for (int wait = 0; wait < 40 && reports.equals("\"\""); wait++) {
            Thread.sleep(250);
            reports = probe.evaluate("window.__reports.join(',')");
        }
        scenario.onActivity(activity -> activity.finishActivity(78));
        InstrumentationRegistry.getInstrumentation().waitForIdleSync();
        String[] all = reports.replace("\"", "").split(",");
        assertTrue("no leave was reported for " + intent.getAction(), !all[0].isEmpty());
        for (int index = 1; index < all.length; index++) assertEquals(all[0], all[index]);
        return all[0];
    }
}
