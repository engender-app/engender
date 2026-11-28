package dev.engender.app.reminders;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

/**
 * The check-in notification's five faces:
 * when they show, where each one lands and what each one is called. The
 * notification itself is built in ReminderAlarmReceiver and checked on a
 * device by ReminderNotificationPrivacyTest; the decisions it builds from
 * are plain logic and live here.
 */
public class CheckInFacesTest {

    private static final String[] FALLBACK = {"Awful", "Bad", "Meh", "Good", "Great"};

    @Test
    public void facesShowOnlyWithTitlesShownAndNoDisguise() {
        assertTrue(CheckInFaces.show(payload(false), false));
        assertFalse("hide sensitive titles keeps the generic notification",
            CheckInFaces.show(payload(true), false));
        assertFalse("disguise keeps the generic notification",
            CheckInFaces.show(payload(false), true));
        assertFalse(CheckInFaces.show(payload(true), true));
    }

    @Test
    public void eachFaceOpensANewEntryForTodayWithItsMood() {
        for (int mood = 1; mood <= 5; mood++) {
            String route = CheckInFaces.route(mood);
            assertEquals("/entry/new/today?seedMood=" + mood, route);
            assertEquals("the launch-route check must keep a face's route",
                route, ReminderScheduler.sanitizeLaunchRoute(route));
        }
    }

    @Test
    public void eachFaceHasItsOwnPendingIntentIdentity() {
        java.util.Set<String> keys = new java.util.HashSet<>();
        java.util.Set<Integer> codes = new java.util.HashSet<>();
        for (int mood = 1; mood <= 5; mood++) {
            keys.add(CheckInFaces.key(mood));
            codes.add(CheckInFaces.requestCode(mood));
        }
        assertEquals(5, keys.size());
        assertEquals(5, codes.size());
        assertFalse("the body tap keeps its own key", keys.contains("check-in"));
        assertFalse("the body tap keeps its own request code", codes.contains(13));
    }

    @Test
    public void facesAreNamedInTheAppsLanguage() throws Exception {
        JSONObject texts = new JSONObject().put("checkInMoods",
            new JSONArray().put("okropnie").put("źle").put("tak sobie").put("dobrze").put("świetnie"));
        assertArrayEquals(new String[] {"okropnie", "źle", "tak sobie", "dobrze", "świetnie"},
            CheckInFaces.names(texts, FALLBACK));
    }

    @Test
    public void aPayloadFromAnOlderBuildFallsBackToTheDevicesNames() throws Exception {
        assertArrayEquals(FALLBACK, CheckInFaces.names(null, FALLBACK));
        assertArrayEquals(FALLBACK, CheckInFaces.names(new JSONObject(), FALLBACK));
        assertArrayEquals("a short list is not five names", FALLBACK,
            CheckInFaces.names(new JSONObject().put("checkInMoods", new JSONArray().put("a").put("b")), FALLBACK));
        assertArrayEquals("a blank name is not a name", FALLBACK, CheckInFaces.names(new JSONObject().put("checkInMoods",
            new JSONArray().put("a").put("b").put(" ").put("d").put("e")), FALLBACK));
    }

    @Test
    public void theFoldedViewCarriesTheQuestionFromAndroid12() {
        assertFalse("before Android 12 the header line already shows it", CheckInFaces.foldedShowsQuestion(30));
        assertTrue(CheckInFaces.foldedShowsQuestion(31));
        assertTrue(CheckInFaces.foldedShowsQuestion(36));
    }

    @Test
    public void theQuestionIsTheAppsCheckInBodyOrItsDefault() throws Exception {
        assertEquals("Jak się dziś czujesz?",
            CheckInFaces.question(new JSONObject().put("checkInBody", "Jak się dziś czujesz?")));
        assertEquals("How are you today?", CheckInFaces.question(null));
        assertEquals("How are you today?", CheckInFaces.question(new JSONObject()));
    }

    private static JSONObject payload(boolean hideTitles) {
        try {
            return new JSONObject().put("hideNotificationTitles", hideTitles);
        } catch (Exception e) {
            throw new AssertionError(e);
        }
    }
}
