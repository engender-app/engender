package dev.engender.app.reminders;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import org.json.JSONObject;
import org.junit.Test;

import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.List;

public class ReminderSchedulerCheckInTest {

    private static final ZoneId ZONE = ZoneId.of("Europe/Warsaw");

    @Test
    public void schedulesTheDayAfterThePause() throws Exception {
        ZonedDateTime now = ZonedDateTime.of(2026, 8, 13, 10, 0, 0, 0, ZONE);
        int today = (int) now.toLocalDate().toEpochDay();
        JSONObject payload = new JSONObject().put("checkInEnabled", true).put("checkInTime", "21:00")
            .put("checkInPausedThrough", today + 1);
        List<ZonedDateTime> alarms = new ArrayList<>();

        ReminderScheduler.scheduleCheckIn(payload, now, alarms::add);

        assertEquals(List.of(now.plusDays(2).withHour(21)), alarms);
    }

    @Test
    public void disabledPreferenceSetsNoAlarm() throws Exception {
        ZonedDateTime now = ZonedDateTime.of(2026, 8, 13, 10, 0, 0, 0, ZONE);
        JSONObject payload = new JSONObject().put("checkInEnabled", false).put("checkInTime", "21:00");
        List<ZonedDateTime> alarms = new ArrayList<>();

        ReminderScheduler.scheduleCheckIn(payload, now, alarms::add);
        assertTrue(alarms.isEmpty());
    }
}
