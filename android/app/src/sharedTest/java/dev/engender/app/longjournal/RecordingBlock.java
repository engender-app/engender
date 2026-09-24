package dev.engender.app.longjournal;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * The block LongJournalBenchmarkTest logs for re-recording android-budgets.json
 * (ux-carpet 218).
 *
 * <p>It used to be assembled with {@code String.format("\"%s\"", ...)}, which
 * leaves a quote inside a string as it is. Three measurements describe a search
 * for a quoted word ({@code search "lustro", one page and the total}), so the
 * block the test tells you to paste was not JSON, and a paste broke the file.
 * Every string now goes through {@link JSONObject#quote}.
 *
 * <p>One entry per line rather than {@code JSONObject.toString(2)}, because the
 * block is read and diffed by eye against the file before it is pasted, and
 * because JSONObject does not keep key order. In sharedTest so the JVM tier can
 * test it; the instrumented test is the only caller.
 */
final class RecordingBlock {

    private RecordingBlock() {}

    static String format(JSONArray measurements, String measuredOn, String fixture, JSONObject budgetTable)
        throws Exception {
        StringBuilder sb = new StringBuilder("{\n");
        sb.append("  \"measuredOn\": ").append(JSONObject.quote(measuredOn)).append(",\n");
        sb.append("  \"fixture\": ").append(JSONObject.quote(fixture)).append(",\n");
        sb.append("  \"measurements\": {\n");
        for (int i = 0; i < measurements.length(); i++) {
            JSONObject m = measurements.getJSONObject(i);
            String name = m.getString("name");
            int baselineMs = (int) Math.round(m.getDouble("ms"));
            int budgetMs = Math.max(200, baselineMs * 5);
            int targetMs = budgetTable.has(name) ? budgetTable.getJSONObject(name).getInt("targetMs") : budgetMs;
            sb.append("    ").append(JSONObject.quote(name)).append(": {\"what\":").append(JSONObject.quote(m.getString("what")));
            sb.append(String.format(",\"baselineMs\":%d,\"budgetMs\":%d,\"targetMs\":%d", baselineMs, budgetMs, targetMs));
            /* The count half, for the screen mounts that carry one. Without
               this a device re-record would drop the numbers the probe took,
               and the next run would fail them as unbudgeted -
               mountBudgetsFor()'s rule in budgets.mjs, restated because a
               Java test cannot import it. */
            if (m.has("statements")) {
                int statements = m.getInt("statements");
                int bytes = m.getInt("bytes");
                sb.append(String.format(
                    ",\"statementBaseline\":%d,\"byteBaseline\":%d,\"statementBudget\":%d,\"byteBudget\":%d",
                    statements, bytes, statements, (int) Math.ceil(bytes * 1.1)));
            }
            sb.append("}");
            if (i < measurements.length() - 1) sb.append(",");
            sb.append("\n");
        }
        sb.append("  }\n}");
        return sb.toString();
    }
}
