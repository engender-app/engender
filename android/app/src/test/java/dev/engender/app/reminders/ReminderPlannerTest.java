package dev.engender.app.reminders;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

import org.json.JSONObject;
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
    public void checkInSkipsTodayWhenThereIsAlreadyAnEntry() {
        ZonedDateTime now = ZonedDateTime.of(2026, 8, 13, 10, 0, 0, 0, ZONE);
        ZonedDateTime next = ReminderPlanner.nextCheckIn("21:00", now, true);

        assertEquals(ZonedDateTime.of(2026, 8, 14, 21, 0, 0, 0, ZONE), next);
    }
}