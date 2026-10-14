package dev.engender.app.reminders;

import static org.junit.Assert.*;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.os.Build;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;

import java.time.ZoneId;
import java.time.ZonedDateTime;

/** The default invocation is self-contained. For process-restart proof, run
 * with zoneStage=first, force-stop, then run with zoneStage=second. */
@RunWith(AndroidJUnit4.class)
public class ReminderZoneChangeStoreTest {
    private static final ZonedDateTime WARSAW = ZonedDateTime.parse("2026-11-18T09:00:00+01:00[Europe/Warsaw]");

    private Context context() {
        return InstrumentationRegistry.getInstrumentation().getTargetContext();
    }

    private NotificationManager manager() {
        return context().getSystemService(NotificationManager.class);
    }

    @Test public void durableZoneChangeAcrossRestart() throws Exception {
        String stage = InstrumentationRegistry.getArguments().getString("zoneStage", "both");
        if (!"second".equals(stage)) firstDeliveryBeforeRestart();
        if (!"first".equals(stage)) changedZoneAfterRestart();
    }

    private void firstDeliveryBeforeRestart() throws Exception {
        ReminderScheduler.wipe(context());
        if (Build.VERSION.SDK_INT >= 33) {
            InstrumentationRegistry.getInstrumentation().getUiAutomation()
                .grantRuntimePermission(context().getPackageName(), Manifest.permission.POST_NOTIFICATIONS);
        }
        manager().cancelAll();
        manager().createNotificationChannel(new NotificationChannel("gd-reminders", "Reminders", NotificationManager.IMPORTANCE_HIGH));
        JSONObject payload = new JSONObject().put("hideNotificationTitles", true)
            .put("texts", new JSONObject().put("channelReminders", "Reminders"))
            .put("reminders", new JSONArray().put(new JSONObject().put("id", "zone-daily")
                .put("enabled", true).put("time", "09:00").put("recurrence", "DAILY")));
        ReminderScheduler.saveAndSchedule(payload, WARSAW.minusMinutes(1), () -> null,
            saved -> ReminderPayloadStore.write(context(), saved), old -> {}, saved -> {});
        ReminderScheduler.deliverReminder(context(), payload, payload.getJSONArray("reminders").getJSONObject(0), WARSAW);
        assertEquals(1, manager().getActiveNotifications().length);
        assertEquals(WARSAW.toInstant().toEpochMilli(), ReminderScheduler.loadPayload(context())
            .getJSONArray("reminders").getJSONObject(0).getLong("deliveredAt"));
        manager().cancelAll();
    }

    private void changedZoneAfterRestart() throws Exception {
        try {
            JSONObject payload = ReminderScheduler.loadPayload(context());
            assertNotNull("first invocation did not leave a durable delivery", payload);
            ZonedDateTime changed = WARSAW.plusMinutes(1).withZoneSameInstant(ZoneId.of("America/New_York"));
            ReminderScheduler.rescheduleFromStore(() -> ReminderScheduler.loadPayload(context()), changed,
                saved -> ReminderPayloadStore.write(context(), saved), old -> {}, saved -> {});
            payload = ReminderScheduler.loadPayload(context());
            JSONObject reminder = payload.getJSONArray("reminders").getJSONObject(0);
            ZonedDateTime future = ZonedDateTime.parse("2026-11-19T09:00:00-05:00[America/New_York]");
            assertEquals(future.toInstant().toEpochMilli(), reminder.getLong("pendingAt"));
            assertEquals(0, manager().getActiveNotifications().length);
            ReminderScheduler.deliverReminder(context(), payload, reminder, future);
            assertEquals(1, manager().getActiveNotifications().length);
        } finally {
            ReminderScheduler.wipe(context());
            manager().cancelAll();
        }
    }
}
