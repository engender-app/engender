package dev.engender.app.longjournal;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

/** A JVM test - no device needed. The re-recording block must be pasteable. */
public class RecordingBlockTest {

    private static JSONObject measurement(String name, String what, double ms) throws Exception {
        return new JSONObject().put("name", name).put("what", what).put("ms", ms);
    }

    @Test
    public void aQuotedWordInADescriptionStillMakesJson() throws Exception {
        JSONArray measurements = new JSONArray()
            .put(measurement("search-common", "search \"lustro\", one page and the total", 151.4))
            .put(measurement("mount-home", "Home, every read on arrival", 179).put("statements", 50).put("bytes", 19161));
        JSONObject budgets = new JSONObject().put("search-common", new JSONObject().put("targetMs", 150));

        JSONObject block = new JSONObject(RecordingBlock.format(
            measurements, "Google Pixel 10a, \"stallion\"", "seed 1, a \\ backslash", budgets));

        JSONObject search = block.getJSONObject("measurements").getJSONObject("search-common");
        assertEquals("search \"lustro\", one page and the total", search.getString("what"));
        assertEquals(151, search.getInt("baselineMs"));
        assertEquals(755, search.getInt("budgetMs"));
        assertEquals(150, search.getInt("targetMs"));
        JSONObject home = block.getJSONObject("measurements").getJSONObject("mount-home");
        assertEquals(895, home.getInt("targetMs"));
        assertEquals(50, home.getInt("statementBudget"));
        assertEquals(21078, home.getInt("byteBudget"));
        assertEquals("Google Pixel 10a, \"stallion\"", block.getString("measuredOn"));
        assertEquals("seed 1, a \\ backslash", block.getString("fixture"));
    }

    @Test
    public void aSmallMeasurementGetsTheFloor() throws Exception {
        JSONObject block = new JSONObject(RecordingBlock.format(
            new JSONArray().put(measurement("words-filter-change", "word list", 6)), "x", "y", new JSONObject()));
        JSONObject words = block.getJSONObject("measurements").getJSONObject("words-filter-change");
        assertEquals(200, words.getInt("budgetMs"));
        assertFalse(words.has("statementBudget"));
    }
}
