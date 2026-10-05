package dev.engender.app.reminders;

import static org.junit.Assert.assertEquals;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

public class ReminderSchedulerMigrationTest {

    private static final ZoneId ZONE = ZoneId.of("Europe/Warsaw");

    private static JSONObject legacyPayload(String time) throws Exception {
        return new JSONObject().put("checkInTime", "21:00")
            .put("hideNotificationTitles", true)
            .put("quietHours", new JSONObject().put("start", "22:00").put("end", "07:00"))
            .put("reminders", new JSONArray().put(new JSONObject()
            .put("id", "weekly")
            .put("title", "Injection")
            .put("enabled", true)
            .put("time", time)
            .put("recurrence", "WEEKLY")));
    }

    @Test
    public void rescheduleBeforeWebViewPersistsTheLegacyNextOccurrenceOnce() throws Exception {
        JSONObject payload = legacyPayload("20:00");
        ZonedDateTime firstReschedule = ZonedDateTime.of(2026, 8, 11, 10, 0, 0, 0, ZONE);
        String[] stored = { null };
        List<String> operations = new ArrayList<>();
        ReminderScheduler.rescheduleFromStore(payload, firstReschedule,
            migrated -> { stored[0] = migrated.toString(); operations.add("persist"); },
            () -> operations.add("cancel"), () -> operations.add("schedule"));
        assertEquals(Arrays.asList("persist", "cancel", "schedule"), operations);

        JSONObject persisted = new JSONObject(stored[0]);
        assertEquals("21:00", persisted.getString("checkInTime"));
        assertEquals(true, persisted.getBoolean("hideNotificationTitles"));
        assertEquals("22:00", persisted.getJSONObject("quietHours").getString("start"));
        JSONObject rule = persisted.getJSONArray("reminders").getJSONObject(0);
        assertEquals("Injection", rule.getString("title"));
        assertEquals("EVERY_N_DAYS", rule.getString("recurrence"));
        assertEquals(7, rule.getInt("interval"));
        assertEquals(20676, rule.getInt("anchorEpochDay"));
        assertEquals(ZonedDateTime.of(2026, 8, 11, 20, 0, 0, 0, ZONE),
            ReminderPlanner.nextReminder(rule, firstReschedule));

        for (int day = 12; day <= 17; day++) {
            ZonedDateTime now = ZonedDateTime.of(2026, 8, day, 10, 0, 0, 0, ZONE);
            ReminderScheduler.rescheduleFromStore(persisted, now,
                migrated -> { throw new AssertionError("An anchored payload must not be rewritten"); },
                () -> {}, () -> {});
            assertEquals(ZonedDateTime.of(2026, 8, 18, 20, 0, 0, 0, ZONE),
                ReminderPlanner.nextReminder(rule, now));
        }
    }

    @Test
    public void anElapsedLegacyTimeKeepsItsFullWeekWait() throws Exception {
        JSONObject payload = legacyPayload("09:30");
        ZonedDateTime now = ZonedDateTime.of(2026, 8, 11, 10, 0, 0, 0, ZONE);
        ReminderScheduler.rescheduleFromStore(payload, now, migrated -> {}, () -> {}, () -> {});
        JSONObject rule = payload.getJSONArray("reminders").getJSONObject(0);
        assertEquals(20683, rule.getInt("anchorEpochDay"));
        assertEquals(ZonedDateTime.of(2026, 8, 18, 9, 30, 0, 0, ZONE),
            ReminderPlanner.nextReminder(rule, now));
    }

    @Test
    public void failedPersistenceDoesNotAllowExistingAlarmsToBeCancelled() throws Exception {
        JSONObject payload = legacyPayload("20:00");
        ZonedDateTime now = ZonedDateTime.of(2026, 8, 11, 10, 0, 0, 0, ZONE);
        List<String> operations = new ArrayList<>();
        ReminderScheduler.rescheduleFromStore(payload, now,
            migrated -> { operations.add("persist"); throw new Exception("wrap failed"); },
            () -> operations.add("cancel"), () -> operations.add("schedule"));
        assertEquals(Arrays.asList("persist"), operations);
    }
}
