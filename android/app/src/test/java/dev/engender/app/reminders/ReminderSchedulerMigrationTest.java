package dev.engender.app.reminders;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

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
        ReminderScheduler.rescheduleFromStore(() -> payload, firstReschedule,
            migrated -> { stored[0] = migrated.toString(); operations.add("persist"); },
            cancelled -> operations.add("cancel"), scheduled -> operations.add("schedule"));
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
            ReminderScheduler.rescheduleFromStore(() -> persisted, now,
                migrated -> { throw new AssertionError("An anchored payload must not be rewritten"); },
                cancelled -> {}, scheduled -> {});
            assertEquals(ZonedDateTime.of(2026, 8, 18, 20, 0, 0, 0, ZONE),
                ReminderPlanner.nextReminder(rule, now));
        }
    }

    @Test
    public void anElapsedLegacyTimeKeepsItsFullWeekWait() throws Exception {
        JSONObject payload = legacyPayload("09:30");
        ZonedDateTime now = ZonedDateTime.of(2026, 8, 11, 10, 0, 0, 0, ZONE);
        ReminderScheduler.rescheduleFromStore(() -> payload, now, migrated -> {}, cancelled -> {}, scheduled -> {});
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
        ReminderScheduler.rescheduleFromStore(() -> payload, now,
            migrated -> { operations.add("persist"); throw new Exception("wrap failed"); },
            cancelled -> operations.add("cancel"), scheduled -> operations.add("schedule"));
        assertEquals(Arrays.asList("persist"), operations);
    }
    @Test
    public void concurrentSyncCannotBeOverwrittenByAnOlderCacheMigration() throws Exception {
        AtomicReference<String> stored = new AtomicReference<>(legacyPayload("20:00").toString());
        JSONObject newer = new JSONObject().put("hideNotificationTitles", false)
            .put("reminders", new JSONArray());
        AtomicReference<String> scheduled = new AtomicReference<>();
        AtomicReference<Throwable> failure = new AtomicReference<>();
        CountDownLatch readOld = new CountDownLatch(1);
        CountDownLatch releaseOld = new CountDownLatch(1);
        CountDownLatch syncStarted = new CountDownLatch(1);
        ZonedDateTime now = ZonedDateTime.of(2026, 8, 11, 10, 0, 0, 0, ZONE);

        Thread receiver = new Thread(() -> {
            try {
                ReminderScheduler.rescheduleFromStore(() -> {
                    JSONObject old = new JSONObject(stored.get());
                    readOld.countDown();
                    if (!releaseOld.await(5, TimeUnit.SECONDS)) throw new AssertionError("Receiver was not released");
                    return old;
                }, now, payload -> stored.set(payload.toString()), cancelled -> {},
                    payload -> scheduled.set(payload.toString()));
            } catch (Throwable error) { failure.set(error); }
        });
        Thread sync = new Thread(() -> {
            try {
                syncStarted.countDown();
                ReminderScheduler.saveAndSchedule(newer, now, () -> new JSONObject(stored.get()),
                    payload -> stored.set(payload.toString()), cancelled -> {},
                    payload -> scheduled.set(payload.toString()));
            } catch (Throwable error) { failure.set(error); }
        });

        receiver.start();
        try {
            assertTrue(readOld.await(5, TimeUnit.SECONDS));
            sync.start();
            assertTrue(syncStarted.await(5, TimeUnit.SECONDS));
            long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
            while (sync.isAlive() && sync.getState() != Thread.State.BLOCKED && System.nanoTime() < deadline) {
                Thread.yield();
            }
        } finally {
            releaseOld.countDown();
            receiver.join(5000);
            sync.join(5000);
        }
        assertFalse(receiver.isAlive());
        assertFalse(sync.isAlive());
        assertNull(failure.get());
        assertEquals(newer.toString(), stored.get());
        assertEquals(newer.toString(), scheduled.get());
    }
}
