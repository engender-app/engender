package dev.barankiewicz.genderdiary.reminders;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;

import android.content.Context;
import android.content.Intent;

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