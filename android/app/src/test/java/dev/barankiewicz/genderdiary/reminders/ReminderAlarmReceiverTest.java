package dev.barankiewicz.genderdiary.reminders;

import static org.junit.Assert.assertEquals;

import org.json.JSONObject;
import org.junit.Test;

/**
 * The title a Reminder notification actually shows (ticket 15's acceptance:
 * "Reminder notifications can hide sensitive titles on a locked device").
 * The app cannot learn whether the screen is locked at the moment an alarm
 * fires, so the preference is not a lock-time check - when it is on, the
 * reminder's own title never reaches the notification, locked or not.
 */
public class ReminderAlarmReceiverTest {

    @Test
    public void reminderTitleShowsByDefault() throws Exception {
        JSONObject payload = new JSONObject().put("texts", new JSONObject().put("channelReminders", "Reminders"));
        JSONObject reminder = new JSONObject().put("title", "Estradiol patch");

        assertEquals("Estradiol patch", ReminderAlarmReceiver.resolveNotificationTitle(payload, reminder));
    }

    @Test
    public void hidingTitlesReplacesTheReminderNameWithTheChannelName() throws Exception {
        JSONObject payload = new JSONObject()
            .put("hideNotificationTitles", true)
            .put("texts", new JSONObject().put("channelReminders", "Reminders"));
        JSONObject reminder = new JSONObject().put("title", "Estradiol patch");

        assertEquals("Reminders", ReminderAlarmReceiver.resolveNotificationTitle(payload, reminder));
    }

    @Test
    public void hidingTitlesFallsBackToTheDefaultChannelNameWithNoTexts() throws Exception {
        JSONObject payload = new JSONObject().put("hideNotificationTitles", true);
        JSONObject reminder = new JSONObject().put("title", "Estradiol patch");

        assertEquals("Reminders", ReminderAlarmReceiver.resolveNotificationTitle(payload, reminder));
    }

    @Test
    public void aReminderWithNoTitleOfItsOwnShowsTheChannelNameEitherWay() throws Exception {
        JSONObject payload = new JSONObject().put("texts", new JSONObject().put("channelReminders", "Reminders"));
        JSONObject reminder = new JSONObject();

        assertEquals("Reminders", ReminderAlarmReceiver.resolveNotificationTitle(payload, reminder));
    }
}
