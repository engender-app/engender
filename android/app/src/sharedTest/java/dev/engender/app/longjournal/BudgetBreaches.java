package dev.engender.app.longjournal;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/** Collect both fixture sizes and scaling before the instrumentation assertion. */
final class BudgetBreaches {
    private BudgetBreaches() {}

    static List<String> collect(JSONArray oneYear, JSONArray tenYears, JSONObject budgetTable,
        JSONArray growthBreaches, boolean recorded) throws Exception {
        List<String> breaches = new ArrayList<>();
        if (recorded) {
            for (String breach : forFixture(oneYear, budgetTable)) breaches.add("one year: " + breach);
            for (String breach : forFixture(tenYears, budgetTable)) breaches.add("ten years: " + breach);
        }
        for (int i = 0; i < growthBreaches.length(); i++) {
            breaches.add("scaling: " + growthBreaches.getString(i));
        }
        return breaches;
    }

    private static List<String> forFixture(JSONArray measurements, JSONObject budgetTable) throws Exception {
        List<String> breaches = new ArrayList<>();

        for (int i = 0; i < measurements.length(); i++) {
            JSONObject m = measurements.getJSONObject(i);
            String name = m.getString("name");
            long ms = Math.round(m.getDouble("ms"));

            if (!budgetTable.has(name)) {
                breaches.add(name + " has no budget - add one to android-budgets.json");
                continue;
            }

            JSONObject budget = budgetTable.getJSONObject(name);
            int budgetMs = budget.getInt("budgetMs");
            if (ms > budgetMs) {
                breaches.add(String.format("%s: %dms over a budget of %dms (baseline %dms)",
                    name, ms, budgetMs, budget.getInt("baselineMs")));
            }

            /* The two count budgets a screen mount carries, judged the same
               way budgets.mjs judges them: a count with no budget is a
               breach rather than a pass, because the alternative is this
               gate quietly not watching the requested reads and returned JSON. */
            if (m.has("statements") != budget.has("statementBudget")) {
                breaches.add(m.has("statements")
                    ? name + " counts statements and has no budget for them - add one to android-budgets.json"
                    : name + " has a statement budget and the run took no count for it");
                continue;
            }
            if (m.has("statements")) {
                int statements = m.getInt("statements");
                int bytes = m.getInt("bytes");
                if (statements > budget.getInt("statementBudget")) {
                    breaches.add(String.format("%s: %d statements over a budget of %d (baseline %d)",
                        name, statements, budget.getInt("statementBudget"), budget.getInt("statementBaseline")));
                }
                if (bytes > budget.getInt("byteBudget")) {
                    breaches.add(String.format("%s: %d bytes over a budget of %d (baseline %d)",
                        name, bytes, budget.getInt("byteBudget"), budget.getInt("byteBaseline")));
                }
            }
        }

        return breaches;
    }
}
