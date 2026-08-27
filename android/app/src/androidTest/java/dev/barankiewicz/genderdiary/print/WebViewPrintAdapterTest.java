package dev.barankiewicz.genderdiary.print;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import android.content.Context;
import android.print.PrintJob;
import android.print.PrintManager;

import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import dev.barankiewicz.genderdiary.MainActivity;
import dev.barankiewicz.genderdiary.webview.WebViewProbe;

import org.junit.Test;
import org.junit.runner.RunWith;

import java.util.List;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Whether the print button does anything on Android (phase 5 ticket 17).
 *
 * `window.print()` is a Chrome method the WebView does not implement: it
 * returns, prints nothing, and reports no error. That is why the clinician
 * visit summary's print button was dead here for a whole phase with nothing
 * failing anywhere, and it is the reason PrintPlugin exists - Android's print
 * stack is reachable only from Java.
 *
 * A silent no-op cannot be told from success by watching the call, so this
 * watches the print stack instead: the app calls its own plugin the way a
 * screen does, over the JS bridge, and the assertion is that Android's print
 * spooler ends up holding a job named by the caller. `window.print()` on this
 * platform would leave that list empty.
 *
 * The job is cancelled straight after. Nothing is printed and no file is
 * written: what the person does with the dialog is the person's business, and
 * this only needs to know the document reached it.
 */
@RunWith(AndroidJUnit4.class)
public class WebViewPrintAdapterTest {

    private static final long TIMEOUT_SECONDS = 60;
    private static final String JOB_NAME = "print adapter test";

    @Test
    public void theDeviceHasAPrintService() {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        assertNotNull(
            "no PRINT_SERVICE, so PrintPlugin has nothing to hand a document to",
            context.getSystemService(Context.PRINT_SERVICE));
    }

    @Test
    public void callingThePluginPutsAJobInAndroidsPrintSpooler() throws Exception {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            WebViewProbe webView = new WebViewProbe(scenario, TIMEOUT_SECONDS);
            webView.awaitTrue("!!(window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Print)");

            // The same call src/lib/print/android-bridge.ts makes.
            webView.evaluate(
                "(function(){"
                    + "window.__printOutcome='pending';"
                    + "window.Capacitor.Plugins.Print.print({jobName:'" + JOB_NAME + "'})"
                    + ".then(function(){window.__printOutcome='resolved';})"
                    + ".catch(function(e){window.__printOutcome='rejected: '+e;});"
                    + "return 'called';"
                    + "})()");

            assertEquals(
                "the plugin did not resolve",
                "\"resolved\"",
                webView.awaitValue("window.__printOutcome", "\"resolved\""));

            try {
                assertTrue(
                    "the print spooler never saw a job, so nothing was printed",
                    awaitJob(scenario));
            } finally {
                cancelJobs(scenario);
            }
        }
    }

    /** Whether a job under our name reached the spooler, within the timeout. */
    private static boolean awaitJob(ActivityScenario<MainActivity> scenario) throws InterruptedException {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(TIMEOUT_SECONDS);
        while (System.nanoTime() < deadline) {
            AtomicReference<Boolean> found = new AtomicReference<>(false);
            scenario.onActivity(
                activity -> {
                    for (PrintJob job : printManager(activity).getPrintJobs()) {
                        if (JOB_NAME.equals(job.getInfo().getLabel())) found.set(true);
                    }
                });
            if (Boolean.TRUE.equals(found.get())) return true;
            Thread.sleep(250);
        }
        return false;
    }

    private static void cancelJobs(ActivityScenario<MainActivity> scenario) {
        scenario.onActivity(
            activity -> {
                List<PrintJob> jobs = printManager(activity).getPrintJobs();
                for (PrintJob job : jobs) {
                    if (JOB_NAME.equals(job.getInfo().getLabel()) && !job.isCancelled()) job.cancel();
                }
            });
    }

    private static PrintManager printManager(MainActivity activity) {
        return (PrintManager) activity.getSystemService(Context.PRINT_SERVICE);
    }
}
