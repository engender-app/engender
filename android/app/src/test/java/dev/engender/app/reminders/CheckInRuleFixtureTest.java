package dev.engender.app.reminders;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;
import org.junit.Test;

/**
 * Reads check-in-rule.json - src/lib/android/fixtures/check-in-rule.json,
 * put on this module's test classpath by build.gradle's sourceSets.test
 * addition - the same file checkIn.test.ts reads on the TypeScript side
 * (ADR-0028). The reminders screen says when a paused check-in comes back;
 * this is what holds the alarm to the day it says.
 */
public class CheckInRuleFixtureTest {

    @Test
    public void nextCheckInAgreesWithEveryFixtureCase() throws IOException, JSONException {
        JSONArray cases = readFixture().getJSONArray("next");
        assertTrue("the fixture loaded no cases", cases.length() > 3);
        for (int i = 0; i < cases.length(); i++) {
            JSONObject testCase = cases.getJSONObject(i);
            String name = testCase.getString("name");
            ZoneId zone = ZoneId.of(testCase.getString("zone"));
            ZonedDateTime now = ZonedDateTime.parse(testCase.getString("nowIso")).withZoneSameInstant(zone);

            ZonedDateTime actual = ReminderPlanner.nextCheckIn(payloadOf(testCase.getJSONObject("checkIn")), now);

            if (testCase.isNull("expectedIso")) {
                assertNull(name, actual);
            } else {
                assertEquals(name, ZonedDateTime.parse(testCase.getString("expectedIso")).toInstant(),
                    actual == null ? null : actual.toInstant());
            }
        }
    }

    @Test
    public void checkInAllowedOnAgreesWithEveryFixtureCase() throws IOException, JSONException {
        JSONArray cases = readFixture().getJSONArray("allowedOn");
        for (int i = 0; i < cases.length(); i++) {
            JSONObject testCase = cases.getJSONObject(i);
            assertEquals(testCase.getString("name"), testCase.getBoolean("allowed"),
                ReminderPlanner.checkInAllowedOn(payloadOf(testCase.getJSONObject("checkIn")), testCase.getInt("day")));
        }
    }

    /** The payload the bridge hands RemindersPlugin, with quiet hours off:
        the fixture is about the pause, and QuietHoursFixtureTest owns the
        window. */
    private static JSONObject payloadOf(JSONObject checkIn) throws JSONException {
        return new JSONObject()
            .put("checkInEnabled", checkIn.getBoolean("enabled"))
            .put("checkInTime", checkIn.optString("time", "21:00"))
            .put("checkInPausedThrough", checkIn.isNull("pausedThroughEpochDay")
                ? JSONObject.NULL : checkIn.getInt("pausedThroughEpochDay"))
            .put("latestEntryEpochDay", checkIn.has("latestEntryEpochDay") && !checkIn.isNull("latestEntryEpochDay")
                ? checkIn.getInt("latestEntryEpochDay") : JSONObject.NULL);
    }

    private static JSONObject readFixture() throws IOException, JSONException {
        try (InputStream in = CheckInRuleFixtureTest.class.getResourceAsStream("/check-in-rule.json")) {
            if (in == null) fail("check-in-rule.json is not on the test classpath - check build.gradle's sourceSets.test.resources");
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buffer = new byte[4096];
            int read;
            while ((read = in.read(buffer)) != -1) {
                out.write(buffer, 0, read);
            }
            return new JSONObject(out.toString("UTF-8"));
        }
    }
}
