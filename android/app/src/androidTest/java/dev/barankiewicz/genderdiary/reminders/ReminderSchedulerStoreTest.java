package dev.barankiewicz.genderdiary.reminders;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class ReminderSchedulerStoreTest {

    private Context context;

    @Before
    public void setUp() {
        context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        context.getSharedPreferences(ReminderScheduler.PREFS, Context.MODE_PRIVATE).edit().clear().commit();
    }

    @After
    public void tearDown() {
        context.getSharedPreferences(ReminderScheduler.PREFS, Context.MODE_PRIVATE).edit().clear().commit();
    }

    @Test
    public void saveAndLoadPayloadRoundTripsTheStoredRuleSet() throws Exception {
        JSONObject payload = new JSONObject()
            .put("reminders", new JSONArray().put(new JSONObject()
                .put("id", "r-1")
                .put("title", "Estradiol patch")
                .put("type", "med")
                .put("time", "20:00")
                .put("recurrence", "DAILY")
                .put("enabled", true)))
            .put("checkInEnabled", true)
            .put("checkInTime", "21:00")
            .put("latestEntryEpochDay", 20313)
            .put("texts", new JSONObject()
                .put("channelReminders", "Reminders")
                .put("channelCheckIn", "Check-in")
                .put("checkInTitle", "Daily check-in")
                .put("checkInBody", "How are you today?"));

        ReminderScheduler.saveAndSchedule(context, payload);

        JSONObject loaded = ReminderScheduler.loadPayload(context);
        assertNotNull(loaded);
        assertEquals(payload.toString(), loaded.toString());
    }

    @Test
    public void wipeCancelsTheAlarmsAndTakesTheTitlesWithThem() throws Exception {
        /* Phase 5 security ticket 01 (F-01). Nothing used to cancel these:
           a wiped phone kept posting the person's own reminder titles on
           schedule, read out of a preference file the reset never touched,
           and the next app open is what cancelled them - on a phone nobody
           opens again, never. */
        ReminderScheduler.saveAndSchedule(context, dailyReminderPayload());
        assertTrue("nothing was scheduled to begin with", reminderAlarmExists());

        ReminderScheduler.wipe(context);

        assertFalse("an alarm is still scheduled", reminderAlarmExists());
        assertNull(ReminderScheduler.loadPayload(context));
        assertTrue(
            "the reminder titles are still here",
            context.getSharedPreferences(ReminderScheduler.PREFS, Context.MODE_PRIVATE).getAll().isEmpty());
    }

    @Test
    public void wipingAPhoneWithNoRemindersOnItIsNotAnError() {
        // The reset is also reachable straight after onboarding.
        ReminderScheduler.wipe(context);
        ReminderScheduler.wipe(context);
        assertNull(ReminderScheduler.loadPayload(context));
    }

    private JSONObject dailyReminderPayload() throws Exception {
        return new JSONObject()
            .put("reminders", new JSONArray().put(new JSONObject()
                .put("id", "r-1")
                .put("title", "Estradiol patch")
                .put("type", "med")
                .put("time", "20:00")
                .put("recurrence", "DAILY")
                .put("enabled", true)))
            .put("checkInEnabled", false)
            .put("checkInTime", "21:00")
            .put("latestEntryEpochDay", JSONObject.NULL)
            .put("texts", new JSONObject()
                .put("channelReminders", "Reminders")
                .put("channelCheckIn", "Check-in")
                .put("checkInTitle", "Daily check-in")
                .put("checkInBody", "How are you today?"));
    }

    /** The PendingIntent AlarmManager is holding, if it still is: built the
        way {@code ReminderScheduler.reminderIntent} builds it and asked for
        with FLAG_NO_CREATE, which finds nothing once the last reference has
        been cancelled. The assertion before the wipe is what keeps this
        honest - a shape that drifted out of step would report "no alarm"
        for a phone full of them. */
    private boolean reminderAlarmExists() {
        Intent intent = new Intent(context, ReminderAlarmReceiver.class)
            .setAction("dev.barankiewicz.genderdiary.REMINDER")
            .setData(Uri.parse("genderdiary://reminder/r-1"));
        PendingIntent pending = PendingIntent.getBroadcast(
            context, 41, intent, PendingIntent.FLAG_NO_CREATE | PendingIntent.FLAG_IMMUTABLE);
        return pending != null;
    }

    @Test
    public void launchRouteIsConsumedOnce() {
        ReminderScheduler.storeLaunchRoute(context, "/settings/reminders/r-1");

        assertEquals("/settings/reminders/r-1", ReminderScheduler.consumeLaunchRoute(context));
        assertNull(ReminderScheduler.consumeLaunchRoute(context));
    }

    @Test
    public void invalidLaunchRouteIsIgnored() {
        ReminderScheduler.storeLaunchRoute(context, "https://example.com/nope");
        ReminderScheduler.storeLaunchRoute(context, "//settings/reminders/r-1");
        ReminderScheduler.storeLaunchRoute(context, "/settings/reminders/r-1/extra");
        ReminderScheduler.storeLaunchRoute(context, "/entry/new/today");

        assertNull(ReminderScheduler.consumeLaunchRoute(context));
    }

    @Test
    public void validLaunchRoutesArePreserved() {
        ReminderScheduler.storeLaunchRoute(context, "/settings/reminders/r-1");
        assertEquals("/settings/reminders/r-1", ReminderScheduler.consumeLaunchRoute(context));

        ReminderScheduler.storeLaunchRoute(context, "/entry/new/20314");
        assertEquals("/entry/new/20314", ReminderScheduler.consumeLaunchRoute(context));
    }

    @Test
    public void rescheduleReceiverKeepsStoredRulesAvailable() throws Exception {
        JSONObject payload = new JSONObject()
            .put("reminders", new JSONArray())
            .put("checkInEnabled", true)
            .put("checkInTime", "21:00")
            .put("latestEntryEpochDay", 20314)
            .put("texts", new JSONObject()
                .put("channelReminders", "Reminders")
                .put("channelCheckIn", "Check-in")
                .put("checkInTitle", "Daily check-in")
                .put("checkInBody", "How are you today?"));

        ReminderScheduler.saveAndSchedule(context, payload);
        new ReminderRescheduleReceiver().onReceive(context, new Intent(Intent.ACTION_BOOT_COMPLETED));
        new ReminderRescheduleReceiver().onReceive(context, new Intent(Intent.ACTION_TIMEZONE_CHANGED));
        new ReminderRescheduleReceiver().onReceive(context, new Intent(Intent.ACTION_MY_PACKAGE_REPLACED));

        assertNotNull(ReminderScheduler.loadPayload(context));
    }

    @Test
    public void rescheduleReceiverIgnoresUnknownAction() throws Exception {
        JSONObject payload = new JSONObject()
            .put("reminders", new JSONArray())
            .put("checkInEnabled", true)
            .put("checkInTime", "21:00")
            .put("latestEntryEpochDay", 20314)
            .put("texts", new JSONObject()
                .put("channelReminders", "Reminders")
                .put("channelCheckIn", "Check-in")
                .put("checkInTitle", "Daily check-in")
                .put("checkInBody", "How are you today?"));

        ReminderScheduler.saveAndSchedule(context, payload);
        new ReminderRescheduleReceiver().onReceive(context, new Intent("dev.barankiewicz.genderdiary.UNRELATED"));

        assertNotNull(ReminderScheduler.loadPayload(context));
    }
}