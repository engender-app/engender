package dev.barankiewicz.genderdiary.reminders;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.fail;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;
import org.junit.Test;

/**
 * Reads launch-routes.json - src/lib/android/fixtures/launch-routes.json,
 * put on this module's test classpath by build.gradle's sourceSets.test
 * addition - the same file launch-routes.test.ts reads on the TypeScript
 * side (ADR-0028). A route shape accepted by one adapter and rejected by
 * the other fails here rather than as a silent tap.
 */
public class ReminderSchedulerLaunchRouteFixtureTest {

    @Test
    public void agreesWithEveryFixtureCase() throws IOException, JSONException {
        JSONArray cases = readFixture();
        for (int i = 0; i < cases.length(); i++) {
            JSONObject testCase = cases.getJSONObject(i);
            String route = testCase.getString("route");
            boolean accepted = testCase.getBoolean("accepted");
            String result = ReminderScheduler.sanitizeLaunchRoute(route);
            if (accepted) {
                assertEquals("route " + JSONObject.quote(route) + " should be accepted", route, result);
            } else {
                assertNull("route " + JSONObject.quote(route) + " should be rejected", result);
            }
        }
    }

    private static JSONArray readFixture() throws IOException, JSONException {
        try (InputStream in = ReminderSchedulerLaunchRouteFixtureTest.class.getResourceAsStream("/launch-routes.json")) {
            if (in == null) fail("launch-routes.json is not on the test classpath - check build.gradle's sourceSets.test.resources");
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
