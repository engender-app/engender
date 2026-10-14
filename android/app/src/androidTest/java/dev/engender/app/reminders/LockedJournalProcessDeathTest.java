package dev.engender.app.reminders;

import static org.junit.Assert.assertTrue;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.content.res.AssetManager;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import dev.engender.app.MainActivity;
import dev.engender.app.webview.WebViewProbe;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;

/** Fixture setup only. The host kills the process and checks the production app. */
@RunWith(AndroidJUnit4.class)
public class LockedJournalProcessDeathTest {
    @Test public void seed() throws Exception {
        Context app = ownedContext();
        File fixture = new File(app.getFilesDir(), "locked-journal-probe");
        copy(InstrumentationRegistry.getInstrumentation().getContext().getAssets(), "locked-journal-probe", fixture);
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            scenario.onActivity(activity -> activity.getBridge().setServerBasePath(fixture.getAbsolutePath()));
            new WebViewProbe(scenario, 120).awaitTrue("document.body.dataset.lockFixture === 'ready'");
            scenario.onActivity(activity -> activity.getBridge().setServerAssetPath("public"));
        }
    }

    @Test public void postReminder() throws Exception {
        Context app = ownedContext();
        NotificationManager manager = app.getSystemService(NotificationManager.class);
        manager.createNotificationChannel(new NotificationChannel(ReminderScheduler.CHANNEL_REMINDERS,
            "Lock probe reminders", NotificationManager.IMPORTANCE_HIGH));
        JSONObject payload = new JSONObject().put("hideNotificationTitles", false);
        JSONObject reminder = new JSONObject().put("id", "lock-probe-49")
            .put("title", "Lock probe arrival 49").put("time", "09:00");
        ReminderAlarmReceiver.postReminderNotification(app, payload, reminder);
        long deadline = android.os.SystemClock.elapsedRealtime() + 10000;
        boolean posted;
        do {
            posted = java.util.Arrays.stream(manager.getActiveNotifications())
                .anyMatch(notification -> "reminder:lock-probe-49".equals(notification.getTag()));
            if (!posted) Thread.sleep(100);
        } while (!posted && android.os.SystemClock.elapsedRealtime() < deadline);
        assertTrue("reminder must be posted", posted);
    }

    private Context ownedContext() {
        Context app = InstrumentationRegistry.getInstrumentation().getTargetContext();
        assertTrue("requires an isolated package", app.getPackageName().startsWith("dev.engender.app.test."));
        return app;
    }

    private void copy(AssetManager assets, String path, File target) throws Exception {
        String[] children = assets.list(path);
        if (children != null && children.length > 0) {
            assertTrue(target.isDirectory() || target.mkdirs());
            for (String child : children) copy(assets, path + "/" + child, new File(target, child));
        } else try (InputStream input = assets.open(path); FileOutputStream output = new FileOutputStream(target)) {
            byte[] bytes = new byte[8192];
            int count;
            while ((count = input.read(bytes)) != -1) output.write(bytes, 0, count);
        }
    }
}
