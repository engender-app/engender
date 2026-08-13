package dev.barankiewicz.genderdiary.reminders;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.service.notification.StatusBarNotification;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

/**
 * Ticket 15's fourth acceptance box, on a device: the notification
 * hideNotificationTitles actually produces, through the real
 * NotificationManager, rather than the string
 * ReminderAlarmReceiverTest.resolveNotificationTitle predicts one would. A
 * locked device shows exactly what NotificationManager was handed, so this
 * is the closest a test gets to the lock screen itself without one.
 */
@RunWith(AndroidJUnit4.class)
public class ReminderNotificationPrivacyTest {

    private static final String REMINDER_ID = "r-1";
    private static final String SENSITIVE_TITLE = "Estradiol patch";
    private static final String CHANNEL_NAME = "Reminders";

    private Context context;

    @Before
    public void setUp() {
        context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        InstrumentationRegistry.getInstrumentation()
            .getUiAutomation()
            .grantRuntimePermission(context.getPackageName(), Manifest.permission.POST_NOTIFICATIONS);
        context.getSharedPreferences(ReminderScheduler.PREFS, Context.MODE_PRIVATE).edit().clear().commit();
        notificationManager().cancelAll();
        // RemindersPlugin.ensureChannels does this from the JS sync path;
        // this test drives ReminderAlarmReceiver directly, so the channel
        // has to exist by some other means or the notification is silently
        // dropped for having none.
        notificationManager().createNotificationChannel(new NotificationChannel(
            ReminderScheduler.CHANNEL_REMINDERS, CHANNEL_NAME, NotificationManager.IMPORTANCE_HIGH));
    }

    @After
    public void tearDown() {
        notificationManager().cancelAll();
        context.getSharedPreferences(ReminderScheduler.PREFS, Context.MODE_PRIVATE).edit().clear().commit();
    }

    @Test
    public void hidingTitlesKeepsTheReminderNameOffTheNotification() throws Exception {
        ReminderScheduler.saveAndSchedule(context, payload(true));

        fireReminderAlarm();

        Notification notification = findNotification();
        assertNotNull("no notification was posted", notification);
        assertEquals(CHANNEL_NAME, notification.extras.getCharSequence(Notification.EXTRA_TITLE).toString());
    }

    @Test
    public void byDefaultTheReminderNameShows() throws Exception {
        ReminderScheduler.saveAndSchedule(context, payload(false));

        fireReminderAlarm();

        Notification notification = findNotification();
        assertNotNull("no notification was posted", notification);
        assertEquals(SENSITIVE_TITLE, notification.extras.getCharSequence(Notification.EXTRA_TITLE).toString());
    }

    private JSONObject payload(boolean hideNotificationTitles) throws Exception {
        return new JSONObject()
            .put("reminders", new JSONArray().put(new JSONObject()
                .put("id", REMINDER_ID)
                .put("title", SENSITIVE_TITLE)
                .put("type", "med")
                .put("time", "20:00")
                .put("recurrence", "DAILY")
                .put("enabled", true)))
            .put("checkInEnabled", false)
            .put("checkInTime", "21:00")
            .put("hideNotificationTitles", hideNotificationTitles)
            .put("latestEntryEpochDay", JSONObject.NULL)
            .put("texts", new JSONObject()
                .put("channelReminders", CHANNEL_NAME)
                .put("channelCheckIn", "Check-in")
                .put("checkInTitle", "Daily check-in")
                .put("checkInBody", "How are you today?"));
    }

    private void fireReminderAlarm() {
        Intent intent = new Intent(context, ReminderAlarmReceiver.class)
            .putExtra(ReminderScheduler.EXTRA_KIND, ReminderScheduler.KIND_REMINDER)
            .putExtra(ReminderScheduler.EXTRA_REMINDER_ID, REMINDER_ID);
        new ReminderAlarmReceiver().onReceive(context, intent);
    }

    private Notification findNotification() {
        for (StatusBarNotification sbn : notificationManager().getActiveNotifications()) {
            if (("reminder:" + REMINDER_ID).equals(sbn.getTag())) return sbn.getNotification();
        }
        return null;
    }

    private NotificationManager notificationManager() {
        return (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
    }
}
