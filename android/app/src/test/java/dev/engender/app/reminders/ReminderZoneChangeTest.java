package dev.engender.app.reminders;

import static org.junit.Assert.*;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.concurrent.atomic.AtomicInteger;

public class ReminderZoneChangeTest {
    private static final ZonedDateTime WARSAW = ZonedDateTime.parse("2026-11-18T09:00:00+01:00[Europe/Warsaw]");

    private JSONObject fresh(String id) throws Exception {
        return new JSONObject().put("reminders", new JSONArray().put(new JSONObject()
            .put("id", id).put("enabled", true).put("time", "09:00").put("recurrence", "DAILY")));
    }

    private JSONObject row(JSONObject payload) throws Exception {
        return payload.getJSONArray("reminders").getJSONObject(0);
    }

    private JSONObject delivered() throws Exception {
        JSONObject payload = fresh("daily");
        ReminderScheduler.saveAndSchedule(payload, WARSAW.minusMinutes(1), () -> null, saved -> {}, old -> {}, saved -> {});
        ReminderScheduler.deliverReminder(payload, row(payload), WARSAW, saved -> {}, reminder -> {}, reminder -> {});
        return new JSONObject(payload.toString());
    }

    @Test public void restartAndWarsawToNewYorkSkipSameSlotButKeepTomorrow() throws Exception {
        JSONObject payload = delivered();
        ZonedDateTime changed = WARSAW.plusMinutes(1).withZoneSameInstant(ZoneId.of("America/New_York"));
        ReminderScheduler.rescheduleFromStore(() -> payload, changed, saved -> {}, old -> {}, saved -> {});
        assertEquals(ZonedDateTime.parse("2026-11-19T09:00:00-05:00[America/New_York]").toInstant().toEpochMilli(),
            row(payload).getLong("pendingAt"));
        AtomicInteger posts = new AtomicInteger();
        ReminderScheduler.deliverReminder(payload, row(payload), changed.plusDays(1).withHour(9).withMinute(0),
            saved -> {}, reminder -> posts.incrementAndGet(), reminder -> {});
        assertEquals(1, posts.get());
    }

    @Test public void foregroundSyncRetainsHistoryOnlyForSameReminderAndRule() throws Exception {
        JSONObject old = delivered();
        ZonedDateTime changed = WARSAW.plusMinutes(1).withZoneSameInstant(ZoneId.of("America/New_York"));
        JSONObject synced = fresh("daily");
        ReminderScheduler.saveAndSchedule(synced, changed, () -> old, saved -> {}, previous -> {}, saved -> {});
        assertEquals(19, java.time.Instant.ofEpochMilli(row(synced).getLong("pendingAt")).atZone(changed.getZone()).getDayOfMonth());
        JSONObject other = fresh("other");
        ReminderScheduler.saveAndSchedule(other, changed, () -> old, saved -> {}, previous -> {}, saved -> {});
        assertEquals(18, java.time.Instant.ofEpochMilli(row(other).getLong("pendingAt")).atZone(changed.getZone()).getDayOfMonth());
        assertFalse(row(other).has("deliveredAt"));
        AtomicInteger otherPosts = new AtomicInteger();
        ReminderScheduler.deliverReminder(other, row(other), changed.withHour(9).withMinute(0),
            saved -> {}, reminder -> otherPosts.incrementAndGet(), reminder -> {});
        assertEquals(1, otherPosts.get());
        JSONObject edited = fresh("daily");
        row(edited).put("time", "10:00");
        ReminderScheduler.saveAndSchedule(edited, changed, () -> old, saved -> {}, previous -> {}, saved -> {});
        assertFalse(row(edited).has("deliveredAt"));
    }

    @Test public void noZoneChangeAndTwelveHourBoundaryRemainEligible() throws Exception {
        JSONObject payload = delivered();
        ReminderScheduler.rescheduleFromStore(() -> payload, WARSAW.minusMinutes(1), saved -> {}, old -> {}, saved -> {});
        assertEquals(WARSAW.toInstant().toEpochMilli(), row(payload).getLong("pendingAt"));
        AtomicInteger posts = new AtomicInteger();
        ReminderScheduler.deliverReminder(payload, row(payload), WARSAW, saved -> {}, reminder -> posts.incrementAndGet(), reminder -> {});
        assertEquals(1, posts.get());
        JSONObject boundary = delivered();
        ZonedDateTime hawaii = WARSAW.withZoneSameInstant(ZoneId.of("Pacific/Pago_Pago"));
        ReminderScheduler.rescheduleFromStore(() -> boundary, hawaii.plusMinutes(1), saved -> {}, old -> {}, saved -> {});
        assertEquals(WARSAW.plusHours(12).toInstant().toEpochMilli(), row(boundary).getLong("pendingAt"));
    }

    @Test public void staleAlarmAndBootCannotReplayDailySlotAfterZoneChange() throws Exception {
        JSONObject payload = delivered();
        ZonedDateTime repeated = WARSAW.withZoneSameInstant(ZoneId.of("America/New_York")).withHour(9);
        row(payload).put("pendingDay", WARSAW.toLocalDate().toEpochDay());
        row(payload).put("pendingZone", repeated.getZone().getId());
        row(payload).put("pendingAt", repeated.toInstant().toEpochMilli());
        ReminderScheduler.deliverReminder(payload, row(payload), repeated, saved -> {},
            reminder -> { throw new AssertionError("stale alarm repeated daily slot"); }, reminder -> {});
        row(payload).put("pendingDay", WARSAW.toLocalDate().toEpochDay());
        row(payload).put("pendingAt", repeated.toInstant().toEpochMilli());
        ReminderScheduler.rescheduleFromStore(() -> payload, repeated.plusMinutes(1), saved -> {}, old -> {}, saved -> {}, true,
            (saved, reminder) -> { throw new AssertionError("boot repeated daily slot"); });
    }

    @Test public void quietHoursKeepOriginalSlotDay() throws Exception {
        JSONObject payload = fresh("daily").put("quietHours", new JSONObject()
            .put("enabled", true).put("start", "08:00").put("end", "07:00"));
        ReminderScheduler.saveAndSchedule(payload, WARSAW.minusMinutes(1), () -> null, saved -> {}, old -> {}, saved -> {});
        assertEquals(WARSAW.toLocalDate().toEpochDay(), row(payload).getLong("pendingDay"));
        ReminderScheduler.deliverReminder(payload, row(payload), WARSAW.plusDays(1).withHour(7), saved -> {}, reminder -> {}, reminder -> {});
        assertEquals(WARSAW.toLocalDate().toEpochDay(), row(payload).getLong("deliveredDay"));
    }
}
