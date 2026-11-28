package dev.engender.app.longjournal;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import java.util.List;

public class BudgetBreachesTest {
    private static JSONObject budget() throws Exception {
        return new JSONObject().put("baselineMs", 1).put("budgetMs", 10)
            .put("statementBaseline", 2).put("statementBudget", 2)
            .put("byteBaseline", 20).put("byteBudget", 22);
    }

    private static JSONObject measurement(String name, int ms, int statements, int bytes) throws Exception {
        return new JSONObject().put("name", name).put("ms", ms).put("statements", statements).put("bytes", bytes);
    }

    @Test public void reportsBothFixturesEveryMetricAndScalingTogether() throws Exception {
        JSONObject budgets = new JSONObject().put("care", budget()).put("stats", budget());
        List<String> failures = BudgetBreaches.collect(
            new JSONArray().put(measurement("care", 11, 3, 23)),
            new JSONArray().put(measurement("stats", 12, 4, 24)), budgets,
            new JSONArray().put("stats grew too much"), true);
        assertEquals(7, failures.size());
        assertTrue(failures.get(0).startsWith("one year: care: 11ms"));
        assertTrue(failures.get(2).startsWith("one year: care: 23 bytes"));
        assertTrue(failures.get(3).startsWith("ten years: stats: 12ms"));
        assertTrue(failures.get(5).startsWith("ten years: stats: 24 bytes"));
        assertEquals("scaling: stats grew too much", failures.get(6));
    }

    @Test public void missingBudgetsAndCountsRemainFailures() throws Exception {
        JSONObject budgets = new JSONObject().put("care", budget())
            .put("unbudgeted-count", new JSONObject().put("baselineMs", 1).put("budgetMs", 10));
        List<String> failures = BudgetBreaches.collect(
            new JSONArray().put(new JSONObject().put("name", "care").put("ms", 1)),
            new JSONArray().put(measurement("unknown", 1, 2, 20))
                .put(measurement("unbudgeted-count", 1, 2, 20)), budgets, new JSONArray(), true);
        assertEquals(3, failures.size());
        assertTrue(failures.get(0).contains("the run took no count"));
        assertTrue(failures.get(1).contains("has no budget"));
        assertTrue(failures.get(2).contains("counts statements and has no budget"));
    }

    @Test public void exactCeilingsPassAndUnrecordedBaselinesStillCheckScaling() throws Exception {
        JSONArray within = new JSONArray().put(measurement("care", 10, 2, 22));
        JSONObject budgets = new JSONObject().put("care", budget());
        assertTrue(BudgetBreaches.collect(within, within, budgets, new JSONArray(), true).isEmpty());
        assertEquals(List.of("scaling: growth"), BudgetBreaches.collect(within, within,
            new JSONObject(), new JSONArray().put("growth"), false));
    }
}
