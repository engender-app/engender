package dev.barankiewicz.genderdiary.reminders;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

import org.junit.Test;

/**
 * sanitizeLaunchRoute's allowlist (phase 4 features ticket 04 added the
 * wrapped and on-this-day shapes to the existing reminder/check-in ones).
 * Pure string logic, so a plain JVM test covers it without an emulator.
 */
public class ReminderSchedulerRouteTest {

    @Test
    public void allowsEachWrappedCadence() {
        assertEquals("/wrapped/week", ReminderScheduler.sanitizeLaunchRoute("/wrapped/week"));
        assertEquals("/wrapped/month", ReminderScheduler.sanitizeLaunchRoute("/wrapped/month"));
        assertEquals("/wrapped/year", ReminderScheduler.sanitizeLaunchRoute("/wrapped/year"));
    }

    @Test
    public void rejectsAnyOtherWrappedCadence() {
        assertNull(ReminderScheduler.sanitizeLaunchRoute("/wrapped/day"));
        assertNull(ReminderScheduler.sanitizeLaunchRoute("/wrapped/"));
        assertNull(ReminderScheduler.sanitizeLaunchRoute("/wrapped/week/extra"));
    }

    @Test
    public void allowsOnThisDayWithOrWithoutALookback() {
        assertEquals("/on-this-day", ReminderScheduler.sanitizeLaunchRoute("/on-this-day"));
        assertEquals("/on-this-day?lookback=month", ReminderScheduler.sanitizeLaunchRoute("/on-this-day?lookback=month"));
        assertEquals(
            "/on-this-day?lookback=sixMonths",
            ReminderScheduler.sanitizeLaunchRoute("/on-this-day?lookback=sixMonths")
        );
        assertEquals("/on-this-day?lookback=year", ReminderScheduler.sanitizeLaunchRoute("/on-this-day?lookback=year"));
    }

    @Test
    public void rejectsAnUnknownOnThisDayLookback() {
        assertNull(ReminderScheduler.sanitizeLaunchRoute("/on-this-day?lookback=twoYears"));
        assertNull(ReminderScheduler.sanitizeLaunchRoute("/on-this-day?lookback="));
        assertNull(ReminderScheduler.sanitizeLaunchRoute("/on-this-day/extra"));
    }

    @Test
    public void stillAllowsTheExistingReminderAndCheckInShapes() {
        assertEquals("/settings/reminders", ReminderScheduler.sanitizeLaunchRoute("/settings/reminders"));
        assertEquals("/settings/reminders/r-1", ReminderScheduler.sanitizeLaunchRoute("/settings/reminders/r-1"));
        assertEquals("/entry/new/20313", ReminderScheduler.sanitizeLaunchRoute("/entry/new/20313"));
    }

    @Test
    public void allowsEachQuickLogWidgetMoodValue() {
        for (int mood = 1; mood <= 5; mood++) {
            String route = "/entry/new/today?seedMood=" + mood;
            assertEquals(route, ReminderScheduler.sanitizeLaunchRoute(route));
        }
    }

    @Test
    public void rejectsAQuickLogWidgetMoodOutsideOneToFive() {
        assertNull(ReminderScheduler.sanitizeLaunchRoute("/entry/new/today?seedMood=0"));
        assertNull(ReminderScheduler.sanitizeLaunchRoute("/entry/new/today?seedMood=6"));
        assertNull(ReminderScheduler.sanitizeLaunchRoute("/entry/new/today?seedMood="));
        assertNull(ReminderScheduler.sanitizeLaunchRoute("/entry/new/today?seedMood=12"));
        assertNull(ReminderScheduler.sanitizeLaunchRoute("/entry/new/today?seedMood=three"));
    }

    @Test
    public void stillRejectsGarbage() {
        assertNull(ReminderScheduler.sanitizeLaunchRoute(null));
        assertNull(ReminderScheduler.sanitizeLaunchRoute(""));
        assertNull(ReminderScheduler.sanitizeLaunchRoute("not-a-route"));
        assertNull(ReminderScheduler.sanitizeLaunchRoute("//evil.example"));
    }
}
