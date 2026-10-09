package dev.engender.app.reminders;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.List;

/**
 * The title a Reminder notification actually shows (ticket 15's acceptance:
 * "Reminder notifications can hide sensitive titles on a locked device").
 * The app cannot learn whether the screen is locked at the moment an alarm
 * fires, so the preference is not a lock-time check - when it is on, the
 * reminder's own title never reaches the notification, locked or not.
 */
public class ReminderAlarmReceiverTest {

    private static final ZoneId ZONE = ZoneId.of("Europe/Warsaw");

    @Test
    public void lateAlarmDuringPauseDoesNotPostAndSchedulesResumption() throws Exception {
        ZonedDateTime now = ZonedDateTime.of(2026, 8, 14, 9, 0, 0, 0, ZONE);
        int today = (int) now.toLocalDate().toEpochDay();
        JSONObject payload = new JSONObject().put("checkInEnabled", true).put("checkInTime", "08:00")
            .put("journalingPauses", new JSONArray().put(new JSONObject()
                .put("startEpochDay", today).put("endEpochDay", today)));
        List<Integer> posts = new ArrayList<>();
        List<ZonedDateTime> alarms = new ArrayList<>();

        ReminderAlarmReceiver.handleCheckIn(payload, now, posts::add, alarms::add);

        assertTrue(posts.isEmpty());
        assertEquals(List.of(now.plusDays(1).withHour(8).withMinute(0)), alarms);
    }

    @Test
    public void postPauseDeliveryPostsAndReschedulesUnlessDisabledOrEntered() throws Exception {
        ZonedDateTime now = ZonedDateTime.of(2026, 8, 15, 9, 0, 0, 0, ZONE);
        int today = (int) now.toLocalDate().toEpochDay();
        JSONObject payload = new JSONObject().put("checkInEnabled", true).put("checkInTime", "08:00")
            .put("journalingPauses", new JSONArray().put(new JSONObject()
                .put("startEpochDay", today - 1).put("endEpochDay", today - 1)));
        List<Integer> posts = new ArrayList<>();
        List<ZonedDateTime> alarms = new ArrayList<>();

        ReminderAlarmReceiver.handleCheckIn(payload, now, posts::add, alarms::add);
        assertEquals(List.of(today), posts);
        assertEquals(List.of(now.plusDays(1).withHour(8).withMinute(0)), alarms);

        posts.clear();
        alarms.clear();
        payload.put("latestEntryEpochDay", today);
        ReminderAlarmReceiver.handleCheckIn(payload, now, posts::add, alarms::add);
        assertTrue(posts.isEmpty());
        assertEquals(1, alarms.size());

        alarms.clear();
        payload.put("latestEntryEpochDay", JSONObject.NULL).put("checkInEnabled", false);
        ReminderAlarmReceiver.handleCheckIn(payload, now, posts::add, alarms::add);
        assertTrue(posts.isEmpty());
        assertTrue(alarms.isEmpty());
    }

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
