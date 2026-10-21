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

public class ReminderSchedulerPersistenceTest {

    private static final ZoneId ZONE = ZoneId.of("Europe/Warsaw");

    /** A cached payload whose reminder has no pending occurrence recorded
        yet, so a reschedule has something to persist. */
    private static JSONObject cachedPayload(String time) throws Exception {
        return new JSONObject().put("checkInTime", "21:00")
            .put("hideNotificationTitles", true)
            .put("quietHours", new JSONObject().put("start", "22:00").put("end", "07:00"))
            .put("reminders", new JSONArray().put(new JSONObject()
            .put("id", "daily")
            .put("title", "Injection")
            .put("enabled", true)
            .put("time", time)
            .put("recurrence", "DAILY")));
    }

    @Test
    public void failedPersistenceDoesNotAllowExistingAlarmsToBeCancelled() throws Exception {
        JSONObject payload = cachedPayload("20:00");
        ZonedDateTime now = ZonedDateTime.of(2026, 8, 11, 10, 0, 0, 0, ZONE);
        List<String> operations = new ArrayList<>();
        ReminderScheduler.rescheduleFromStore(() -> payload, now,
            migrated -> { operations.add("persist"); throw new Exception("wrap failed"); },
            cancelled -> operations.add("cancel"), scheduled -> operations.add("schedule"));
        assertEquals(Arrays.asList("persist"), operations);
    }

    @Test
    public void concurrentSyncCannotBeOverwrittenByAnOlderCacheReschedule() throws Exception {
        AtomicReference<String> stored = new AtomicReference<>(cachedPayload("20:00").toString());
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
