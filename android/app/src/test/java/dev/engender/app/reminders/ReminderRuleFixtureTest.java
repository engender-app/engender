package dev.engender.app.reminders;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;
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
 * Reads reminder-rule.json - src/lib/android/fixtures/reminder-rule.json,
 * put on this module's test classpath by build.gradle's sourceSets.test
 * addition - the same file reminderRule.test.ts reads on the TypeScript
 * side (ADR-0028). A rule that fires at one moment in the editor's preview
 * and another in the alarm the scheduler sets fails here rather than as a
 * notification that arrives on the wrong day.
 */
public class ReminderRuleFixtureTest {

    @Test
    public void agreesWithEveryFixtureCase() throws IOException, JSONException {
        JSONArray cases = readFixture();
        for (int i = 0; i < cases.length(); i++) {
            JSONObject testCase = cases.getJSONObject(i);
            String name = testCase.getString("name");
            ZoneId zone = ZoneId.of(testCase.getString("zone"));
            ZonedDateTime now = ZonedDateTime.parse(testCase.getString("nowIso")).withZoneSameInstant(zone);

            ZonedDateTime actual = ReminderPlanner.nextOccurrence(testCase.getJSONObject("rule"), now);

            if (testCase.isNull("expectedIso")) {
                assertNull(name, actual);
            } else {
                // Compared as instants: the expected ISO carries its own
                // offset, so this asserts the moment rather than how it is
                // spelt.
                assertEquals(name, ZonedDateTime.parse(testCase.getString("expectedIso")).toInstant(),
                    actual == null ? null : actual.toInstant());
            }
        }
    }

    private static JSONArray readFixture() throws IOException, JSONException {
        try (InputStream in = ReminderRuleFixtureTest.class.getResourceAsStream("/reminder-rule.json")) {
            if (in == null) fail("reminder-rule.json is not on the test classpath - check build.gradle's sourceSets.test.resources");
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
