package dev.engender.app.reminders;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.List;

public class ReminderBootCatchUpTest {
    private static final ZonedDateTime BEFORE = ZonedDateTime.parse("2026-11-18T08:59:00+01:00[Europe/Warsaw]");

    @Test public void schedulingPersistsThePendingOccurrenceInsideTheWrappedPayload() throws Exception {
        JSONObject payload = new JSONObject().put("reminders", new JSONArray().put(new JSONObject()
            .put("id", "daily").put("enabled", true).put("time", "09:00").put("recurrence", "DAILY")));
        String[] stored = { null };
        ReminderScheduler.saveAndSchedule(payload, BEFORE, () -> null,
            saved -> stored[0] = saved.toString(), old -> {}, saved -> {});
        JSONObject reminder = new JSONObject(stored[0]).getJSONArray("reminders").getJSONObject(0);
        assertTrue("scheduled occurrence was not persisted", reminder.has("pendingAt"));
        assertEquals(BEFORE.withHour(9).withMinute(0).toInstant().toEpochMilli(), reminder.getLong("pendingAt"));
    }

    private JSONObject payload(String recurrence) throws Exception {
        return new JSONObject().put("reminders", new JSONArray().put(new JSONObject()
            .put("id", "r-1").put("enabled", true).put("time", "09:00")
            .put("recurrence", recurrence == null ? JSONObject.NULL : recurrence)
            .put("epochDay", recurrence == null ? BEFORE.toLocalDate().toEpochDay() : JSONObject.NULL)));
    }

    private JSONObject rule(JSONObject payload) throws Exception {
        return payload.getJSONArray("reminders").getJSONObject(0);
    }

    private JSONObject scheduled(String recurrence) throws Exception {
        JSONObject payload = payload(recurrence);
        ReminderScheduler.saveAndSchedule(payload, BEFORE, () -> null, saved -> {}, old -> {}, saved -> {});
        return payload;
    }

    @Test public void longAbsenceDeliversOnePendingOccurrenceThenOnlyTheNextFutureOccurrence() throws Exception {
        JSONObject payload = scheduled("DAILY");
        ZonedDateTime boot = BEFORE.plusDays(30).withHour(10);
        List<String> operations = new ArrayList<>();
        ReminderScheduler.rescheduleFromStore(() -> payload, boot,
            saved -> operations.add("persist"), old -> operations.add("cancel"), saved -> operations.add("schedule"),
            true, (saved, reminder) -> operations.add("post"));
        assertEquals(List.of("persist", "cancel", "post", "schedule"), operations);
        assertEquals(boot.plusDays(1).withHour(9).withMinute(0).toInstant().toEpochMilli(), rule(payload).getLong("pendingAt"));
        ReminderScheduler.rescheduleFromStore(() -> payload, boot.plusMinutes(1), saved -> {}, old -> {}, saved -> {},
            true, (saved, reminder) -> { throw new AssertionError("Another boot repeated the caught-up occurrence"); });
    }

    @Test public void oneOffCatchUpIsConsumedBeforePostingAndNeverBecomesRecurring() throws Exception {
        JSONObject payload = scheduled(null);
        List<String> operations = new ArrayList<>();
        ReminderScheduler.rescheduleFromStore(() -> payload, BEFORE.withHour(10),
            saved -> { assertFalse(rule(saved).has("pendingAt")); operations.add("persist"); }, old -> {}, saved -> {},
            true, (saved, reminder) -> operations.add("post"));
        assertEquals(List.of("persist", "post"), operations);
        assertNull(ReminderPlanner.nextReminder(rule(payload), BEFORE.withHour(10)));
        ReminderScheduler.rescheduleFromStore(() -> payload, BEFORE.plusDays(1), saved -> {}, old -> {}, saved -> {},
            true, (saved, reminder) -> { throw new AssertionError("One-off became recurring"); });
    }

    @Test public void failedCatchUpPersistenceCannotPostOrReplaceAlarms() throws Exception {
        JSONObject payload = scheduled("DAILY");
        List<String> operations = new ArrayList<>();
        ReminderScheduler.rescheduleFromStore(() -> payload, BEFORE.withHour(10),
            saved -> { operations.add("persist"); throw new Exception("store failed"); },
            old -> operations.add("cancel"), saved -> operations.add("schedule"), true, (saved, reminder) -> operations.add("post"));
        assertEquals(List.of("persist"), operations);
    }

    @Test public void ordinaryAlarmConsumesPendingOneOffBeforeItPosts() throws Exception {
        JSONObject payload = scheduled(null);
        List<String> operations = new ArrayList<>();
        ReminderScheduler.deliverReminder(payload, rule(payload), BEFORE.withHour(9).withMinute(0),
            saved -> { assertFalse(rule(saved).has("pendingAt")); operations.add("persist"); },
            reminder -> operations.add("post"), reminder -> operations.add("schedule"));
        assertEquals(List.of("persist", "post", "schedule"), operations);
        ReminderScheduler.rescheduleFromStore(() -> payload, BEFORE.withHour(10), saved -> {}, old -> {}, saved -> {},
            true, (saved, reminder) -> { throw new AssertionError("Delivered one-off was caught up again"); });
    }

    @Test public void failedOrdinaryConsumptionCannotPost() throws Exception {
        JSONObject payload = scheduled("DAILY");
        ReminderScheduler.deliverReminder(payload, rule(payload), BEFORE.withHour(10),
            saved -> { throw new Exception("store failed"); },
            reminder -> { throw new AssertionError("Posted before persistence"); },
            reminder -> { throw new AssertionError("Scheduled before persistence"); });
    }

    @Test public void quietBootHoldsCatchUpAcrossAnotherBootAndForegroundSync() throws Exception {
        JSONObject payload = scheduled(null).put("quietHours", new JSONObject()
            .put("enabled", true).put("start", "12:00").put("end", "13:00"));
        ZonedDateTime boot = BEFORE.withHour(12).withMinute(30);
        ReminderScheduler.rescheduleFromStore(() -> payload, boot, saved -> {}, old -> {}, saved -> {}, true,
            (saved, reminder) -> { throw new AssertionError("Boot ignored quiet hours"); });
        assertEquals(boot.withHour(13).withMinute(0).toInstant().toEpochMilli(), rule(payload).getLong("pendingAt"));
        assertTrue(rule(payload).getBoolean("bootCatchUp"));
        ReminderScheduler.rescheduleFromStore(() -> payload, boot.plusMinutes(1), saved -> {}, old -> {}, saved -> {}, true,
            (saved, reminder) -> { throw new AssertionError("Boot ignored deferred catch-up"); });
        JSONObject synced = payload(null).put("quietHours", payload.getJSONObject("quietHours"));
        ReminderScheduler.saveAndSchedule(synced, boot.plusMinutes(2), () -> payload, saved -> {}, old -> {}, saved -> {});
        assertEquals(rule(payload).getLong("pendingAt"), rule(synced).getLong("pendingAt"));
        ReminderScheduler.deliverReminder(synced, rule(synced), boot.withHour(13).withMinute(0), saved -> {}, reminder -> {}, reminder -> {});
        assertFalse(rule(synced).has("pendingAt"));
        assertFalse(rule(synced).has("bootCatchUp"));
    }

    @Test public void changedOrDisabledRuleDoesNotInheritDeferredCatchUp() throws Exception {
        JSONObject old = scheduled(null);
        rule(old).put("bootCatchUp", true);
        JSONObject changed = payload(null);
        rule(changed).put("time", "08:00");
        ReminderScheduler.saveAndSchedule(changed, BEFORE.withHour(12), () -> old, saved -> {}, previous -> {}, saved -> {});
        assertFalse(rule(changed).has("pendingAt"));
        assertFalse(rule(changed).has("bootCatchUp"));
        rule(old).put("enabled", false);
        ReminderScheduler.rescheduleFromStore(() -> old, BEFORE.withHour(12), saved -> {}, previous -> {}, saved -> {}, true,
            (saved, reminder) -> { throw new AssertionError("Disabled reminder posted"); });
        assertFalse(rule(old).has("pendingAt"));
    }

    @Test public void legacyPayloadCannotInventMissedOccurrences() throws Exception {
        JSONObject payload = payload("DAILY");
        ReminderScheduler.rescheduleFromStore(() -> payload, BEFORE.withHour(10), saved -> {}, old -> {}, saved -> {}, true,
            (saved, reminder) -> { throw new AssertionError("Boot invented a pending occurrence"); });
        assertEquals(BEFORE.plusDays(1).withHour(9).withMinute(0).toInstant().toEpochMilli(), rule(payload).getLong("pendingAt"));
    }

    @Test public void nonBootRescheduleRetainsExistingFutureOnlyPolicy() throws Exception {
        JSONObject payload = scheduled("DAILY");
        ReminderScheduler.rescheduleFromStore(() -> payload, BEFORE.withHour(10), saved -> {}, old -> {}, saved -> {}, false,
            (saved, reminder) -> { throw new AssertionError("Non-boot reschedule posted catch-up"); });
        assertEquals(BEFORE.plusDays(1).withHour(9).withMinute(0).toInstant().toEpochMilli(), rule(payload).getLong("pendingAt"));
    }
}
