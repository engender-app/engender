package dev.engender.app.reminders;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

import org.json.JSONObject;
import org.json.JSONArray;
import org.junit.Test;

import java.time.ZoneId;
import java.time.ZonedDateTime;

/**
 * What nextReminder() decides on top of the rule: whether the row is
 * switched on, and whether its JSON says anything this build understands.
 * The rule arithmetic itself is ReminderRuleFixtureTest's, against the
 * fixture the TypeScript side reads too - cases duplicated here would be
 * a second place for the two languages to disagree.
 */
public class ReminderPlannerTest {

    private static final ZoneId ZONE = ZoneId.of("Europe/Warsaw");

    @Test
    public void aDisabledReminderIsNotScheduled() throws Exception {
        JSONObject rule = new JSONObject()
            .put("enabled", false)
            .put("time", "08:00")
            .put("recurrence", "DAILY");

        ZonedDateTime now = ZonedDateTime.of(2026, 8, 13, 10, 0, 0, 0, ZONE);
        assertNull(ReminderPlanner.nextReminder(rule, now));
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
    public void unanchoredLegacyWeeklyRuleIsNotScheduled() throws Exception {
        JSONObject rule = new JSONObject()
            .put("enabled", true)
            .put("time", "20:00")
            .put("recurrence", "WEEKLY");

        ZonedDateTime now = ZonedDateTime.of(2026, 8, 11, 10, 0, 0, 0, ZONE);
        assertNull(ReminderPlanner.nextReminder(rule, now));
    }

    @Test
    public void checkInSkipsTodayWhenThereIsAlreadyAnEntry() throws Exception {
        ZonedDateTime now = ZonedDateTime.of(2026, 8, 13, 10, 0, 0, 0, ZONE);
        ZonedDateTime next = ReminderPlanner.nextCheckIn(checkIn(new JSONArray())
            .put("latestEntryEpochDay", now.toLocalDate().toEpochDay()), now);

        assertEquals(ZonedDateTime.of(2026, 8, 14, 21, 0, 0, 0, ZONE), next);
    }

    private static JSONObject checkIn(JSONArray pauses) throws Exception {
        return new JSONObject().put("checkInEnabled", true).put("checkInTime", "21:00")
            .put("journalingPauses", pauses);
    }

    private static JSONObject pause(int start, Integer end) throws Exception {
        return new JSONObject().put("startEpochDay", start)
            .put("endEpochDay", end == null ? JSONObject.NULL : end);
    }

    @Test
    public void futureAndFinitePausesSkipInclusiveDates() throws Exception {
        ZonedDateTime now = ZonedDateTime.of(2026, 8, 13, 10, 0, 0, 0, ZONE);
        int tomorrow = (int) now.toLocalDate().plusDays(1).toEpochDay();
        JSONObject payload = checkIn(new JSONArray().put(pause(tomorrow, tomorrow + 2)));

        assertEquals(now.withHour(21), ReminderPlanner.nextCheckIn(payload, now));
        assertEquals(now.plusDays(4).withHour(21),
            ReminderPlanner.nextCheckIn(payload, now.withHour(22)));
    }

    @Test
    public void activeOpenEndedAndOverlappingPausesStaySuppressed() throws Exception {
        ZonedDateTime now = ZonedDateTime.of(2026, 8, 13, 10, 0, 0, 0, ZONE);
        int today = (int) now.toLocalDate().toEpochDay();
        JSONObject finite = checkIn(new JSONArray().put(pause(today, today + 1))
            .put(pause(today + 1, today + 3)));
        assertEquals(now.plusDays(4).withHour(21), ReminderPlanner.nextCheckIn(finite, now));
        assertNull(ReminderPlanner.nextCheckIn(
            checkIn(new JSONArray().put(pause(today, null))), now));
    }

    @Test
    public void quietHoursCannotMoveCheckInIntoPausedDay() throws Exception {
        ZonedDateTime now = ZonedDateTime.of(2026, 8, 13, 10, 0, 0, 0, ZONE);
        int tomorrow = (int) now.toLocalDate().plusDays(1).toEpochDay();
        JSONObject payload = checkIn(new JSONArray().put(pause(tomorrow, tomorrow)))
            .put("checkInTime", "23:00")
            .put("quietHours", new JSONObject().put("enabled", true)
                .put("start", "22:00").put("end", "07:00"));
        assertEquals(now.plusDays(3).withHour(7), ReminderPlanner.nextCheckIn(payload, now));
    }

    @Test
    public void savedLegacyPayloadAndDisabledPreferenceRemainSafe() throws Exception {
        ZonedDateTime now = ZonedDateTime.of(2026, 8, 13, 10, 0, 0, 0, ZONE);
        JSONObject old = new JSONObject().put("checkInEnabled", true).put("checkInTime", "21:00");
        assertEquals(now.withHour(21), ReminderPlanner.nextCheckIn(old, now));
        old.put("checkInEnabled", false);
        assertNull(ReminderPlanner.nextCheckIn(old, now));
        assertEquals(false, ReminderPlanner.checkInAllowedOn(old, (int) now.toLocalDate().toEpochDay()));
    }

    @Test
    public void deliveryGuardUsesLocalCalendarDayAndCurrentPreference() throws Exception {
        int day = (int) ZonedDateTime.of(2026, 3, 29, 8, 0, 0, 0, ZONE)
            .toLocalDate().toEpochDay();
        JSONObject payload = checkIn(new JSONArray().put(pause(day, day)));
        assertEquals(false, ReminderPlanner.checkInAllowedOn(payload, day));
        assertEquals(true, ReminderPlanner.checkInAllowedOn(payload, day + 1));
        payload.put("checkInEnabled", false);
        assertEquals(false, ReminderPlanner.checkInAllowedOn(payload, day + 1));
    }

    @Test
    public void pauseDatesRemainCalendarDaysAcrossDstChange() throws Exception {
        ZonedDateTime now = ZonedDateTime.of(2026, 3, 28, 22, 0, 0, 0, ZONE);
        int sunday = (int) now.toLocalDate().plusDays(1).toEpochDay();
        JSONObject payload = checkIn(new JSONArray().put(pause(sunday, sunday)));
        assertEquals(ZonedDateTime.of(2026, 3, 30, 21, 0, 0, 0, ZONE),
            ReminderPlanner.nextCheckIn(payload, now));
    }
}
