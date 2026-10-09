package dev.engender.app.reminders;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.List;

public class ReminderQuietHoursResyncTest {
    private static final ZonedDateTime BEFORE = ZonedDateTime.parse("2026-10-09T21:00:00+02:00[Europe/Warsaw]");
    private static final ZonedDateTime HELD = BEFORE.plusDays(1).withHour(7);

    private static JSONObject payload() throws Exception {
        return new JSONObject().put("checkInEnabled", true).put("checkInTime", "23:00")
            .put("quietHours", new JSONObject().put("enabled", true).put("start", "22:00").put("end", "07:00"));
    }

    private static JSONObject reminder(String recurrence) throws Exception {
        return new JSONObject().put("id", "r-1").put("enabled", true).put("time", "23:00")
            .put("epochDay", BEFORE.toLocalDate().toEpochDay())
            .put("recurrence", recurrence == null ? JSONObject.NULL : recurrence);
    }

    private static List<ZonedDateTime> sync(JSONObject payload, JSONObject reminder, ZonedDateTime now,
                                           boolean fromStore) throws Exception {
        payload.put("reminders", new JSONArray().put(reminder));
        List<ZonedDateTime> alarms = new ArrayList<>();
        alarms.add(HELD);
        if (fromStore) {
            ReminderScheduler.rescheduleFromStore(() -> payload, now, saved -> {}, old -> alarms.clear(),
                saved -> ReminderScheduler.scheduleOneReminder(saved, reminder, now, alarms::add));
        } else {
            ReminderScheduler.saveAndSchedule(payload, now, () -> payload, saved -> {}, old -> alarms.clear(),
                saved -> ReminderScheduler.scheduleOneReminder(saved, reminder, now, alarms::add));
        }
        return alarms;
    }

    @Test public void oneOffSurvivesForegroundAndNativeResyncUntilDelivery() throws Exception {
        JSONObject reminder = reminder(null);
        assertEquals(List.of(HELD), sync(payload(), reminder, BEFORE, false));
        ZonedDateTime reopened = HELD.withHour(0).withMinute(5);
        assertEquals(List.of(HELD), sync(payload(), reminder, reopened, false));
        assertEquals(List.of(HELD), sync(payload(), reminder, reopened, true));
        assertTrue(sync(payload(), reminder, HELD, false).isEmpty());
        assertTrue(sync(payload(), reminder, HELD.plusMinutes(1), true).isEmpty());
    }

    @Test public void dailyAndAnchoredRemindersKeepHeldOccurrenceWithoutRepeatingIt() throws Exception {
        for (String recurrence : List.of("DAILY", "EVERY_N_DAYS")) {
            JSONObject reminder = reminder(recurrence).put("interval", 7)
                .put("anchorEpochDay", BEFORE.toLocalDate().toEpochDay());
            assertEquals(List.of(HELD), sync(payload(), reminder, HELD.withHour(0), false));
            assertEquals(List.of(HELD.plusDays("DAILY".equals(recurrence) ? 1 : 7)),
                sync(payload(), reminder, HELD, true));
        }
    }

    @Test public void sameDayHoldSurvivesResync() throws Exception {
        JSONObject payload = payload().put("quietHours", new JSONObject().put("enabled", true)
            .put("start", "12:00").put("end", "13:00"));
        assertEquals(List.of(BEFORE.withHour(13)), sync(payload, reminder(null).put("time", "12:15"),
            BEFORE.withHour(12).withMinute(30), false));
    }

    @Test public void disabledQuietHoursDoNotReviveElapsedOneOff() throws Exception {
        JSONObject payload = payload();
        payload.getJSONObject("quietHours").put("enabled", false);
        assertTrue(sync(payload, reminder(null), HELD.withHour(0), false).isEmpty());
        assertTrue(sync(payload(), reminder(null).put("enabled", false), BEFORE, false).isEmpty());
    }

    @Test public void checkInSurvivesResyncAndAdvancesOnlyAfterDelivery() throws Exception {
        List<ZonedDateTime> alarms = new ArrayList<>();
        JSONObject payload = payload();
        ZonedDateTime now = HELD.withHour(0).withMinute(5);
        ReminderScheduler.saveAndSchedule(payload, now, () -> payload, saved -> {}, old -> alarms.clear(),
            saved -> ReminderScheduler.scheduleCheckIn(saved, now, alarms::add));
        assertEquals(List.of(HELD), alarms);
        assertEquals(HELD.plusDays(1), ReminderPlanner.nextCheckIn(payload, HELD));
    }

    @Test public void checkInResyncRespectsEntriesOnOriginalAndDeliveryDays() throws Exception {
        int today = (int) HELD.toLocalDate().toEpochDay();
        assertEquals(HELD.plusDays(1), ReminderPlanner.nextCheckIn(
            payload().put("latestEntryEpochDay", today - 1), HELD.withHour(0)));
        assertEquals(HELD.plusDays(2), ReminderPlanner.nextCheckIn(
            payload().put("latestEntryEpochDay", today), HELD.withHour(0)));
    }

    @Test public void checkInResyncRespectsPausesOnOriginalAndDeliveryDays() throws Exception {
        int today = (int) HELD.toLocalDate().toEpochDay();
        for (int day : new int[] { today - 1, today }) {
            JSONObject payload = payload().put("journalingPauses", new JSONArray().put(new JSONObject()
                .put("startEpochDay", day).put("endEpochDay", day)));
            assertEquals(HELD.plusDays(day == today ? 2 : 1),
                ReminderPlanner.nextCheckIn(payload, HELD.withHour(0)));
        }
    }

    @Test public void heldDeliveryUsesLocalTimeAcrossDstAndTimezoneResync() throws Exception {
        for (String timestamp : List.of("2026-10-25T00:05:00+02:00[Europe/Warsaw]",
                "2026-03-29T00:05:00+01:00[Europe/Warsaw]", "2026-10-10T00:05:00-04:00[America/New_York]")) {
            ZonedDateTime now = ZonedDateTime.parse(timestamp);
            JSONObject reminder = reminder(null).put("epochDay", now.toLocalDate().minusDays(1).toEpochDay());
            ZonedDateTime expected = now.withHour(7).withMinute(0);
            assertEquals(List.of(expected), sync(payload(), reminder, now, true));
            assertEquals(expected, ReminderPlanner.nextCheckIn(payload(), now));
        }
    }
}
