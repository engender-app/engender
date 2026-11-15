package dev.engender.app.launch;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assume.assumeTrue;

import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Bundle;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import java.io.File;

import org.junit.Test;
import org.junit.runner.RunWith;

/**
 * The device half of the tally widget proof (security scan GD-011), driven
 * by tests/tally-widget-device-proof.mjs. Skipped unless that script passes
 * `-e tallyWidgetProof true`: it launches the app and then waits for the
 * script, which drives the page over CDP, to touch files in the app's cache.
 *
 * <p>Launch one is the widget's Misgendered button exactly as the widget
 * builds it, then the same button sent again and a kept copy of its intent
 * replayed: both must open nothing. Launch two is the button the widget is
 * rebuilt with after the spend.
 */
@RunWith(AndroidJUnit4.class)
public class TallyWidgetDeviceProofTest {
    private static final String KEY = "widget-tally-misgendered";
    private static final int REQUEST_CODE = 200;

    @Test
    public void widgetButtonLaunchesOnceAndIsRebuilt() throws Exception {
        Bundle args = InstrumentationRegistry.getArguments();
        assumeTrue("run by tests/tally-widget-device-proof.mjs", "true".equals(args.getString("tallyWidgetProof")));
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        File cache = context.getCacheDir();
        File phaseTwo = new File(cache, "tally-proof-phase-2");
        File done = new File(cache, "tally-proof-done");
        phaseTwo.delete();
        done.delete();
        SharedPreferences tickets = context.getSharedPreferences("engender-launch-once", Context.MODE_PRIVATE);
        // TallyWidgetProvider.tallyRoute("misgendered"), pinned by the launch-route fixture.
        String route = "/?tally=misgendered";

        Intent kept = AppLaunch.onceIntent(context, route, KEY).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        PendingIntent button = AppLaunch.openAppIntentOnce(context, route, KEY, REQUEST_CODE);
        button.send();
        awaitSpent(tickets, kept);
        boolean refused = false;
        try {
            button.send();
        } catch (PendingIntent.CanceledException expected) {
            refused = true;
        }
        if (!refused) throw new AssertionError("the spent widget button launched again");
        assertNull("a kept copy authenticated after the spend", AppLaunch.authenticatedRoute(context, new Intent(kept)));
        context.startActivity(kept);
        System.out.println("TALLY-PROOF launch one sent, second send refused, kept copy replayed");

        awaitFile(phaseTwo, 300_000);
        PendingIntent rebuilt = AppLaunch.openAppIntentOnce(context, route, KEY, REQUEST_CODE);
        rebuilt.send();
        System.out.println("TALLY-PROOF launch two sent");
        awaitFile(done, 300_000);
    }

    private static void awaitSpent(SharedPreferences tickets, Intent kept) throws InterruptedException {
        String ticket = kept.getData().getLastPathSegment();
        long deadline = System.nanoTime() + 30_000_000_000L;
        while (ticket.equals(tickets.getString(KEY, null)) && System.nanoTime() < deadline) Thread.sleep(100);
        assertFalse("the launch never spent its ticket", ticket.equals(tickets.getString(KEY, null)));
    }

    private static void awaitFile(File file, long millis) throws InterruptedException {
        long deadline = System.nanoTime() + millis * 1_000_000L;
        while (!file.exists() && System.nanoTime() < deadline) Thread.sleep(200);
        if (!file.exists()) throw new AssertionError("the driving script never wrote " + file.getName());
    }
}
