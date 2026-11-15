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
import org.junit.Test;
import org.junit.runner.RunWith;

/**
 * GD-018: a handler the app opens for a result is another app. The cover is
 * up before it can draw, stays up for as long as it is in front, and a
 * handler that is not a system component gets no lock grace.
 */
@RunWith(AndroidJUnit4.class)
public class LeaveCoverBeforeHandlerTest {
    private final Context app = InstrumentationRegistry.getInstrumentation().getTargetContext();
    private static final String[] ACTIONS = {
        MediaStore.ACTION_IMAGE_CAPTURE, Intent.ACTION_OPEN_DOCUMENT,
        Intent.ACTION_CREATE_DOCUMENT, Intent.ACTION_OPEN_DOCUMENT_TREE};

    @After public void tearDown() {
        TranslucentHandlerActivity.onFirstFrame = null;
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
                scenario.onActivity(activity -> {
                    TranslucentHandlerActivity.onFirstFrame = () -> {
                        coveredWhenDrawn.set(LeaveCover.isShown());
                        drawn.countDown();
                    };
                    activity.startActivityForResult(handler(action), 77);
                    // Synchronously, before the activity manager has even been asked to pause this one.
                    coveredOnReturn.set(LeaveCover.isShown());
                });
                assertTrue("handler never drew for " + action, drawn.await(15, TimeUnit.SECONDS));
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
            Intent system = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
            assertEquals("true", leaveReport(scenario, probe, system));
        }
    }

    /** What the activity tells the page about a leave to {@code intent}: the argument of __lockOnLeaveFromNative. */
    private String leaveReport(ActivityScenario<MainActivity> scenario, WebViewProbe probe, Intent intent) throws Exception {
        probe.evaluate("window.__reports = []; window.__lockOnLeaveFromNative = function (own) { window.__reports.push(String(own)); }; 1");
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
