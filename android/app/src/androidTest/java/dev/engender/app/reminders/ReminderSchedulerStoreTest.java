package dev.engender.app.reminders;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import android.app.AlarmManager;
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

    /* The reminder alarm in dailyReminderPayload, as ReminderScheduler
       builds it: read by the tests that ask whether it is scheduled and by
       the one that clears it. */
    private static final int REMINDER_REQUEST_CODE = 41;
    private static final String REMINDER_ACTION = "dev.engender.app.REMINDER";
    private static final String REMINDER_DATA = "engender://reminder/r-1";

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
        /* Nothing used to cancel these: a wiped phone kept posting the
           person's own reminder titles on schedule, read out of a
           preference file the reset never touched, and the next app open
           is what cancelled them - on a phone nobody opens again, never
           (audit finding F-01). */
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
    public void wipeCancelsTheCheckInAlarmEvenWithThePayloadAlreadyGone() throws Exception {
        /* The check-in alarm is named by a fixed request code, not by
           anything in the payload, so losing the payload is no reason to
           leave it scheduled. It used to be: cancelAll returned on a null
           payload before it reached this alarm, which meant a reminders
           file that would not parse - or one an interrupted wipe had
           already cleared - left a check-in alarm nothing could reach. */
        ReminderScheduler.saveAndSchedule(context, checkInPayload());
        assertTrue("nothing was scheduled to begin with", checkInAlarmExists());
        context.getSharedPreferences(ReminderScheduler.PREFS, Context.MODE_PRIVATE).edit().clear().commit();

        ReminderScheduler.wipe(context);

        assertFalse("the check-in alarm is still scheduled", checkInAlarmExists());
    }

    @Test
    public void wipingAPhoneWithNoRemindersOnItIsNotAnError() throws Exception {
        // The reset is also reachable straight after onboarding.
        ReminderScheduler.wipe(context);
        ReminderScheduler.wipe(context);
        assertNull(ReminderScheduler.loadPayload(context));
    }

    private JSONObject checkInPayload() throws Exception {
        return dailyReminderPayload().put("checkInEnabled", true);
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

    /* The PendingIntents AlarmManager is holding, if it still is: built the
       way ReminderScheduler's own reminderIntent and checkInIntent build
       them, and asked for with FLAG_NO_CREATE, which finds nothing once the
       last reference has been cancelled. The assertion before each wipe is
       what keeps this honest - a shape that drifted out of step would
       report "no alarm" for a phone full of them. */
    private boolean reminderAlarmExists() {
        return alarmExists(REMINDER_REQUEST_CODE, REMINDER_ACTION, REMINDER_DATA);
    }

    private boolean checkInAlarmExists() {
        return alarmExists(42, "dev.engender.app.CHECK_IN", "engender://check-in");
    }

    private boolean alarmExists(int requestCode, String action, String data) {
        PendingIntent pending = PendingIntent.getBroadcast(
            context, requestCode, alarmIntent(action, data), PendingIntent.FLAG_NO_CREATE | PendingIntent.FLAG_IMMUTABLE);
        return pending != null;
    }

    private Intent alarmIntent(String action, String data) {
        return new Intent(context, ReminderAlarmReceiver.class).setAction(action).setData(Uri.parse(data));
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
    public void alarmsComeBackAfterEveryRescheduleEventWithTheJournalNeverOpened() throws Exception {
        /* Audit finding G-02. Each of these three events
           takes the alarms with it, and the payload the receiver reads back
           afterwards is now wrapped - so this is the path that would break
           if reading it needed the data key. Nothing in this process has
           opened the journal; there is no database here at all. The events
           themselves are the part a test cannot stage, and cancelling the
           PendingIntent by hand leaves the same starting state: rules on
           disk, nothing scheduled.

           The pre-existing rescheduleReceiver tests below assert that the
           payload survives all three; this one asserts an alarm comes back
           from it, which is the half that was inferred. */
        ReminderScheduler.saveAndSchedule(context, dailyReminderPayload());

        for (String action : new String[] {
            Intent.ACTION_BOOT_COMPLETED, Intent.ACTION_TIMEZONE_CHANGED, Intent.ACTION_MY_PACKAGE_REPLACED
        }) {
            cancelReminderAlarm();
            assertFalse("the alarm was still scheduled before " + action, reminderAlarmExists());

            new ReminderRescheduleReceiver().onReceive(context, new Intent(action));

            assertTrue("no alarm came back after " + action, reminderAlarmExists());
        }
    }

    private void cancelReminderAlarm() {
        PendingIntent pending = PendingIntent.getBroadcast(
            context,
            REMINDER_REQUEST_CODE,
            alarmIntent(REMINDER_ACTION, REMINDER_DATA),
            PendingIntent.FLAG_NO_CREATE | PendingIntent.FLAG_IMMUTABLE);
        if (pending == null) return;
        AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarmManager != null) alarmManager.cancel(pending);
        pending.cancel();
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
        new ReminderRescheduleReceiver().onReceive(context, new Intent("dev.engender.app.UNRELATED"));

        assertNotNull(ReminderScheduler.loadPayload(context));
    }
}