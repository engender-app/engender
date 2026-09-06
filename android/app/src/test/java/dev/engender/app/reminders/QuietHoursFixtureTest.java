package dev.engender.app.reminders;

import static org.junit.Assert.assertEquals;
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
 * Reads quiet-hours.json - src/lib/android/fixtures/quiet-hours.json, put on
 * this module's test classpath by build.gradle's sourceSets.test addition -
 * the same file quietHours.test.ts reads on the TypeScript side (ADR-0028).
 *
 * <p>A window the settings screen draws one way and the scheduler applies
 * another fails here rather than as an alarm that wakes somebody at three in
 * the morning.
 */
public class QuietHoursFixtureTest {

    @Test
    public void agreesWithEveryFixtureCase() throws IOException, JSONException {
        JSONArray cases = readFixture();
        assertTrue("the fixture loaded no cases", cases.length() > 6);

        for (int i = 0; i < cases.length(); i++) {
            JSONObject testCase = cases.getJSONObject(i);
            String name = testCase.getString("name");
            ZoneId zone = ZoneId.of(testCase.getString("zone"));
            ZonedDateTime now = ZonedDateTime.parse(testCase.getString("nowIso")).withZoneSameInstant(zone);
            JSONObject window = testCase.getJSONObject("quietHours");

            // The case's own `atLocal`, which the TypeScript side reads
            // instead of a zone, has to be the same wall clock this side sees.
            assertEquals(
                name + ": atLocal disagrees with nowIso",
                QuietHours.minuteOfDay(testCase.getString("atLocal")),
                now.getHour() * 60 + now.getMinute()
            );

            boolean inside = window.getBoolean("enabled")
                && QuietHours.inside(
                    now.getHour() * 60 + now.getMinute(),
                    QuietHours.minuteOfDay(window.getString("start")),
                    QuietHours.minuteOfDay(window.getString("end"))
                );
            assertEquals(name, testCase.getBoolean("inside"), inside);

            // Compared as instants: the expected ISO carries its own offset,
            // so this asserts the moment rather than how it is spelt - which
            // is what the two summer-time cases are in the fixture for.
            assertEquals(
                name,
                ZonedDateTime.parse(testCase.getString("heldIso")).toInstant(),
                QuietHours.hold(now, window).toInstant()
            );
        }
    }

    @Test
    public void holdsNothingWhenThePayloadCarriesNoWindow() {
        // A payload written by a build from before this ticket has no
        // quietHours object at all, and has to schedule exactly as it did.
        ZonedDateTime at = ZonedDateTime.parse("2026-08-11T23:30:00+02:00");
        assertEquals(at, QuietHours.hold(at, null));
    }

    private static JSONArray readFixture() throws IOException, JSONException {
        try (InputStream in = QuietHoursFixtureTest.class.getResourceAsStream("/quiet-hours.json")) {
            if (in == null) fail("quiet-hours.json is not on the test classpath - check build.gradle's sourceSets.test.resources");
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buffer = new byte[4096];
            int read;
            while ((read = in.read(buffer)) != -1) {
                out.write(buffer, 0, read);
            }
            return new JSONArray(out.toString("UTF-8"));
        }
    }
}
