package dev.barankiewicz.genderdiary.reminders;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

/**
 * resolveCheckInAffirmation (phase 4 features ticket 22): which affirming
 * line, if any, rides in the check-in notification. Pure payload logic, so
 * a plain JVM test covers it without an emulator.
 */
public class CheckInAffirmationTest {

    private static JSONObject payloadWith(String... lines) throws Exception {
        JSONArray pool = new JSONArray();
        for (String line : lines) pool.put(line);
        return new JSONObject().put("checkInAffirmations", pool);
    }

    @Test
    public void rotatesThroughThePoolByDay() throws Exception {
        JSONObject payload = payloadWith("first", "second", "third");

        assertEquals("first", ReminderAlarmReceiver.resolveCheckInAffirmation(payload, 21000));
        assertEquals("second", ReminderAlarmReceiver.resolveCheckInAffirmation(payload, 21001));
        assertEquals("third", ReminderAlarmReceiver.resolveCheckInAffirmation(payload, 21002));
        assertEquals("first", ReminderAlarmReceiver.resolveCheckInAffirmation(payload, 21003));
    }

    @Test
    public void emptyPoolMeansNoLine() throws Exception {
        assertNull(ReminderAlarmReceiver.resolveCheckInAffirmation(payloadWith(), 21000));
    }

    @Test
    public void payloadWithoutThePoolMeansNoLine() throws Exception {
        assertNull(ReminderAlarmReceiver.resolveCheckInAffirmation(new JSONObject(), 21000));
    }

    @Test
    public void hideNotificationTitlesSuppressesTheLine() throws Exception {
        JSONObject payload = payloadWith("first", "second").put("hideNotificationTitles", true);

        assertNull(ReminderAlarmReceiver.resolveCheckInAffirmation(payload, 21000));
    }

    @Test
    public void blankLineFallsBackToNoLine() throws Exception {
        assertNull(ReminderAlarmReceiver.resolveCheckInAffirmation(payloadWith("   "), 21000));
    }
}
