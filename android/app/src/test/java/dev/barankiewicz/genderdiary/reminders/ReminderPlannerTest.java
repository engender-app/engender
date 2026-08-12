package dev.barankiewicz.genderdiary.reminders;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

import org.json.JSONObject;
import org.junit.Test;

import java.time.ZoneId;
import java.time.ZonedDateTime;

public class ReminderPlannerTest {

    private static final ZoneId ZONE = ZoneId.of("Europe/Warsaw");

    @Test
    public void oneOffInThePastIsNotScheduledAgain() throws Exception {
        JSONObject rule = new JSONObject()
            .put("enabled", true)
            .put("time", "08:00")
            .put("recurrence", JSONObject.NULL)
            .put("epochDay", 20300);

        ZonedDateTime now = ZonedDateTime.of(2026, 8, 13, 10, 0, 0, 0, ZONE);
        assertNull(ReminderPlanner.nextReminder(rule, now));
    }

    @Test
    public void dailyMovesToTomorrowWhenTodaysTimePassed() throws Exception {
        JSONObject rule = new JSONObject()
            .put("enabled", true)
            .put("time", "08:00")
            .put("recurrence", "DAILY");

        ZonedDateTime now = ZonedDateTime.of(2026, 8, 13, 10, 0, 0, 0, ZONE);
        ZonedDateTime next = ReminderPlanner.nextReminder(rule, now);

        assertEquals(ZonedDateTime.of(2026, 8, 14, 8, 0, 0, 0, ZONE), next);
    }

    @Test
    public void everyNDaysUsesItsAnchorProgression() throws Exception {
        JSONObject rule = new JSONObject()
            .put("enabled", true)
            .put("time", "20:00")
            .put("recurrence", "EVERY_N_DAYS")
            .put("interval", 3)
            .put("anchorEpochDay", 20670);

        ZonedDateTime now = ZonedDateTime.of(2026, 8, 13, 21, 0, 0, 0, ZONE);
        ZonedDateTime next = ReminderPlanner.nextReminder(rule, now);

        assertEquals(ZonedDateTime.of(2026, 8, 16, 20, 0, 0, 0, ZONE), next);
    }

    @Test
    public void unknownRecurrenceIsRejected() throws Exception {
        JSONObject rule = new JSONObject()
            .put("enabled", true)
            .put("time", "08:00")
            .put("recurrence", "MONTHLY");

        ZonedDateTime now = ZonedDateTime.of(2026, 8, 13, 10, 0, 0, 0, ZONE);
        assertNull(ReminderPlanner.nextReminder(rule, now));
    }

    @Test
    public void checkInSkipsTodayWhenThereIsAlreadyAnEntry() {
        ZonedDateTime now = ZonedDateTime.of(2026, 8, 13, 10, 0, 0, 0, ZONE);
        ZonedDateTime next = ReminderPlanner.nextCheckIn("21:00", now, true);

        assertEquals(ZonedDateTime.of(2026, 8, 14, 21, 0, 0, 0, ZONE), next);
    }
}