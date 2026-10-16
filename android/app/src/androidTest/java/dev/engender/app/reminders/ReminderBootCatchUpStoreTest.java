package dev.engender.app.reminders;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.ParcelFileDescriptor;
import android.service.notification.StatusBarNotification;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

import java.time.ZonedDateTime;
import java.io.FileInputStream;
import java.nio.charset.StandardCharsets;
import java.io.ByteArrayOutputStream;

@RunWith(AndroidJUnit4.class)
public class ReminderBootCatchUpStoreTest {
    private Context context;
    private NotificationManager manager;

    @Before public void setUp() throws Exception {
        context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        manager = context.getSystemService(NotificationManager.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            InstrumentationRegistry.getInstrumentation().getUiAutomation()
                .grantRuntimePermission(context.getPackageName(), Manifest.permission.POST_NOTIFICATIONS);
        }
        ReminderScheduler.wipe(context);
        manager.cancelAll();
        manager.createNotificationChannel(new NotificationChannel("gd-reminders", "Reminders", NotificationManager.IMPORTANCE_HIGH));
    }

    @After public void tearDown() throws Exception {
        ReminderScheduler.wipe(context);
        manager.cancelAll();
    }

    @Test public void bootConsumesWrappedMissedOccurrencesOnceWithTitlesHidden() throws Exception {
        JSONObject payload = new JSONObject().put("hideNotificationTitles", true)
            .put("texts", new JSONObject().put("channelReminders", "Reminders"));
        JSONArray reminders = new JSONArray();
        for (String recurrence : new String[] { "DAILY", "one-off" }) {
            reminders.put(new JSONObject().put("id", recurrence.equals("DAILY") ? "daily" : "one-off")
                .put("title", "Synthetic private title").put("enabled", true).put("time", "09:00")
                .put("recurrence", recurrence.equals("DAILY") ? "DAILY" : JSONObject.NULL)
                .put("epochDay", ZonedDateTime.now().minusDays(1).toLocalDate().toEpochDay())
                .put("pendingAt", System.currentTimeMillis() - 86_400_000));
        }
        payload.put("reminders", reminders);
        ReminderPayloadStore.write(context, payload);
        ReminderRescheduleReceiver receiver = new ReminderRescheduleReceiver();
        receiver.onReceive(context, new Intent(Intent.ACTION_BOOT_COMPLETED));

        assertNotNull(notification("reminder:daily"));
        assertNotNull(notification("reminder:one-off"));
        assertEquals("Reminders", notification("reminder:one-off").extras.getString(Notification.EXTRA_TITLE));
        JSONObject stored = ReminderScheduler.loadPayload(context);
        assertFalse(stored.getJSONArray("reminders").getJSONObject(1).has("pendingAt"));
        manager.cancelAll();
        receiver.onReceive(context, new Intent(Intent.ACTION_BOOT_COMPLETED));
        assertEquals(0, manager.getActiveNotifications().length);
    }

    @Test public void quietBootSchedulesTheHeldOneOffInsteadOfDroppingIt() throws Exception {
        ZonedDateTime now = ZonedDateTime.now();
        String start = now.minusMinutes(30).toLocalTime().toString().substring(0, 5);
        String end = now.plusMinutes(30).toLocalTime().toString().substring(0, 5);
        JSONObject payload = new JSONObject().put("quietHours", new JSONObject()
            .put("enabled", true).put("start", start).put("end", end))
            .put("reminders", new JSONArray().put(new JSONObject().put("id", "quiet-one-off")
                .put("enabled", true).put("time", "09:00").put("recurrence", JSONObject.NULL)
                .put("epochDay", now.minusDays(1).toLocalDate().toEpochDay())
                .put("pendingAt", now.minusDays(1).toInstant().toEpochMilli())));
        ReminderPayloadStore.write(context, payload);
        new ReminderRescheduleReceiver().onReceive(context, new Intent(Intent.ACTION_BOOT_COMPLETED));
        assertEquals(0, manager.getActiveNotifications().length);
        JSONObject stored = ReminderScheduler.loadPayload(context);
        JSONObject reminder = stored.getJSONArray("reminders").getJSONObject(0);
        long heldAt = QuietHours.hold(now, payload.getJSONObject("quietHours")).toInstant().toEpochMilli();
        assertEquals(heldAt, reminder.getLong("pendingAt"));
        assertTrue(reminder.getBoolean("bootCatchUp"));
        String dump;
        try (ParcelFileDescriptor descriptor = InstrumentationRegistry.getInstrumentation().getUiAutomation()
                .executeShellCommand("dumpsys alarm");
             FileInputStream input = new FileInputStream(descriptor.getFileDescriptor());
             ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192];
            int count;
            while ((count = input.read(buffer)) != -1) output.write(buffer, 0, count);
            dump = output.toString(StandardCharsets.UTF_8.name());
        }
        boolean scheduled = false;
        for (String block : dump.split("(?m)(?=^\\s*(?:RTC_WAKEUP|RTC|ELAPSED_WAKEUP|ELAPSED) #[0-9]+:)")) {
            if (block.contains(context.getPackageName()) && block.contains("tag=*walarm*:dev.engender.app.REMINDER\n")
                && block.contains("origWhen " + heldAt + " ")) scheduled = true;
        }
        assertTrue("no held one-off alarm", scheduled);
    }

    private Notification notification(String tag) {
        for (StatusBarNotification notification : manager.getActiveNotifications()) {
            if (tag.equals(notification.getTag())) return notification.getNotification();
        }
        return null;
    }
}
