package dev.barankiewicz.genderdiary.longjournal;

import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

import android.content.Context;
import android.content.res.AssetManager;
import android.os.Build;
import android.util.Log;

import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import dev.barankiewicz.genderdiary.MainActivity;

import org.json.JSONObject;
import org.json.JSONArray;
import org.junit.Test;
import org.junit.runner.RunWith;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Runs the ten-year Journal benchmark over the native Android driver (ticket 20).
 *
 * <p>Generates 3231 entries over 3653 days, 375 photos, 122 lab results and 12
 * milestones through the same probe generate.ts and measure.ts use on the web, then
 * checks fifteen timing measurements against the budgets in android-budgets.json.
 *
 * <p>The probe bundle is built by tests/android-tier/run.mjs (ANDROID_TIER_PROBE=long-journal)
 * and shipped as an androidTest asset under long-journal-probe/. The WebView runs it
 * through Bridge.setServerBasePath, exactly as the contract and archive probes do.
 *
 * <p>Baselines of zero in android-budgets.json mean the numbers have not been recorded
 * on a real device yet. The test runs and prints measurements in that state, but does
 * not fail on budget: the point is to let the first run on a real device produce the
 * numbers that go into the file, not to gate on placeholder zeroes. Re-record by
 * running this test with the recording flag set, copying the logged JSON into
 * android-budgets.json, and committing the result.
 */
@RunWith(AndroidJUnit4.class)
public class LongJournalBenchmarkTest {

    private static final String TAG = "LongJournalBenchmark";

    /** Where run.mjs puts the long-journal probe bundle inside the test APK. */
    private static final String PROBE_ASSETS = "long-journal-probe";

    /** Where the budgets live inside the test APK. */
    private static final String BUDGETS_ASSET = "android-budgets.json";

    /** The database the probe opens - deleted before each run so it starts empty. */
    private static final String PROBE_DATABASE = "long-journal-benchmark.sqlite3";

    /** 60 minutes: the probe generates a decade of journal entries with photos on real device.
        Device I/O and encryption overhead make this ~14x slower than headless Chrome (~44s).
        Real device timing (Pixel 10a GrapheneOS): fixture 600s+, measurements 300+s. */
    private static final long RESULT_TIMEOUT_SECONDS = 3600;

    @Test
    public void longJournalMeasurementsAreWithinBudget() throws Exception {
        File probeDir = unpackProbe();
        deleteProbeArtifacts();

        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            scenario.onActivity(activity -> activity.getBridge().setServerBasePath(probeDir.getAbsolutePath()));

            String raw = awaitResult(scenario);
            JSONObject result = new JSONObject(raw);

            if (result.has("error")) {
                fail("the long-journal probe failed before it could report: " + result.getString("error"));
            }

            JSONArray measurements = result.getJSONArray("measurements");
            int generatedInMs = result.optInt("generatedInMs", -1);
            long photoBytes = result.optLong("photoBytes", -1);

            Log.i(TAG, String.format(
                "Fixture generated in %ds, %.0fMB of photos.",
                generatedInMs / 1000, photoBytes / 1_048_576.0));

            JSONObject budgets = readBudgets();
            JSONObject budgetTable = budgets.getJSONObject("measurements");
            boolean unrecorded = isUnrecorded(budgetTable);

            if (unrecorded) {
                Log.w(TAG, "android-budgets.json has zero baselines - measurements not yet recorded on a real device.");
                Log.w(TAG, "Run this test on a real device and copy the logged JSON block into android-budgets.json.");
            }

            logMeasurements(measurements, budgetTable);
            logRecordingBlock(measurements, budgets, budgetTable);

            if (!unrecorded) {
                checkBudgets(measurements, budgetTable);
            }
        }
    }

    /** Returns true when all baselines are zero, meaning no real-device run has been recorded yet. */
    private static boolean isUnrecorded(JSONObject budgetTable) throws Exception {
        Iterator<String> keys = budgetTable.keys();
        while (keys.hasNext()) {
            if (budgetTable.getJSONObject(keys.next()).getInt("baselineMs") != 0) return false;
        }
        return true;
    }

    /** Logs one line per measurement with its time, heap and budget. */
    private static void logMeasurements(JSONArray measurements, JSONObject budgetTable) throws Exception {
        for (int i = 0; i < measurements.length(); i++) {
            JSONObject m = measurements.getJSONObject(i);
            String name = m.getString("name");
            long ms = Math.round(m.getDouble("ms"));
            String heap = m.isNull("heapBytes") ? "" : String.format("  heap %.1fMB", m.getDouble("heapBytes") / 1_048_576.0);
            String budget = "";
            if (budgetTable.has(name)) {
                int budgetMs = budgetTable.getJSONObject(name).getInt("budgetMs");
                budget = String.format("  budget %dms", budgetMs);
            } else {
                budget = "  NO BUDGET";
            }
            Log.i(TAG, String.format("  %-55s %4dms%s%s", m.getString("what"), ms, heap, budget));
        }
    }

    /** Logs a JSON block in the shape android-budgets.json needs, for re-recording. */
    private static void logRecordingBlock(JSONArray measurements, JSONObject budgets, JSONObject budgetTable)
        throws Exception {
        Log.i(TAG, "--- android-budgets.json measurements block (5x baseline, 200ms floor) ---");
        StringBuilder sb = new StringBuilder("{\n");
        sb.append(String.format("  \"measuredOn\": \"%s\",\n", measuredOn()));
        sb.append(String.format("  \"fixture\": \"%s\",\n", budgets.getString("fixture")));
        sb.append("  \"measurements\": {\n");
        for (int i = 0; i < measurements.length(); i++) {
            JSONObject m = measurements.getJSONObject(i);
            String name = m.getString("name");
            int baselineMs = (int) Math.round(m.getDouble("ms"));
            int budgetMs = Math.max(200, baselineMs * 5);
            int targetMs = budgetTable.has(name) ? budgetTable.getJSONObject(name).getInt("targetMs") : budgetMs;
            Object heapBudget = JSONObject.NULL;
            if (budgetTable.has(name) && !budgetTable.getJSONObject(name).isNull("heapBudgetBytes")) {
                heapBudget = budgetTable.getJSONObject(name).getInt("heapBudgetBytes");
            }
            double heapBytes = m.isNull("heapBytes") ? 0 : m.getDouble("heapBytes");
            sb.append(String.format("    \"%s\": {\"what\":\"%s\",\"baselineMs\":%d,\"budgetMs\":%d,\"targetMs\":%d,\"heapBaselineBytes\":%d,\"heapBudgetBytes\":%s}",
                name, m.getString("what"), baselineMs, budgetMs, targetMs, (long) heapBytes, heapBudget.toString()));
            if (i < measurements.length() - 1) sb.append(",");
            sb.append("\n");
        }
        sb.append("  }\n}");
        Log.i(TAG, sb.toString());
    }

    private static String measuredOn() {
        return String.format(
            "%s %s, API %d, fingerprint %s",
            Build.MANUFACTURER,
            Build.MODEL,
            Build.VERSION.SDK_INT,
            Build.FINGERPRINT);
    }

    /** Fails the test for each measurement that exceeds its budget. */
    private static void checkBudgets(JSONArray measurements, JSONObject budgetTable) throws Exception {
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

            if (!budget.isNull("heapBudgetBytes") && !m.isNull("heapBytes")) {
                long heapBytes = Math.round(m.getDouble("heapBytes"));
                long heapBudget = budget.getLong("heapBudgetBytes");
                if (heapBytes > heapBudget) {
                    breaches.add(String.format("%s: %.1fMB of heap over a budget of %.1fMB",
                        name, heapBytes / 1_048_576.0, heapBudget / 1_048_576.0));
                }
            }
        }

        assertTrue(
            "long-journal benchmark exceeded " + breaches.size() + " budget(s): " + breaches,
            breaches.isEmpty());
    }

    /** Polls the WebView until the probe publishes its result. */
    private String awaitResult(ActivityScenario<MainActivity> scenario) throws InterruptedException {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(RESULT_TIMEOUT_SECONDS);

        while (System.nanoTime() < deadline) {
            AtomicReference<String> value = new AtomicReference<>();
            CountDownLatch evaluated = new CountDownLatch(1);

            scenario.onActivity(
                activity ->
                    activity
                        .getBridge()
                        .getWebView()
                        .evaluateJavascript(
                            "document.body && document.body.dataset.longJournalReady === 'true'"
                                + " ? JSON.stringify(window.__longJournalResult) : ''",
                            result -> {
                                value.set(result);
                                evaluated.countDown();
                            }));

            if (!evaluated.await(30, TimeUnit.SECONDS)) {
                throw new AssertionError("the WebView stopped answering");
            }

            String json = unquote(value.get());
            if (json != null && !json.isEmpty()) return json;
            Thread.sleep(500);
        }

        throw new AssertionError(
            "the long-journal probe did not report within " + RESULT_TIMEOUT_SECONDS + "s; check logcat for errors");
    }

    private static String unquote(String evaluated) {
        if (evaluated == null || evaluated.equals("null") || evaluated.equals("\"\"")) return null;
        try {
            return new JSONArray("[" + evaluated + "]").getString(0);
        } catch (Exception e) {
            return null;
        }
    }

    /** Reads android-budgets.json from the test APK assets. */
    private static JSONObject readBudgets() throws Exception {
        Context test = InstrumentationRegistry.getInstrumentation().getContext();
        try (InputStream in = test.getAssets().open(BUDGETS_ASSET)) {
            byte[] bytes = in.readAllBytes();
            return new JSONObject(new String(bytes, java.nio.charset.StandardCharsets.UTF_8));
        }
    }

    private static File unpackProbe() throws IOException {
        Context test = InstrumentationRegistry.getInstrumentation().getContext();
        Context app = InstrumentationRegistry.getInstrumentation().getTargetContext();

        File target = new File(app.getFilesDir(), PROBE_ASSETS);
        deleteRecursively(target);
        if (!target.mkdirs()) throw new IOException("could not create " + target);

        copyAssetDirectory(test.getAssets(), PROBE_ASSETS, target);

        File index = new File(target, "index.html");
        if (!index.exists()) {
            throw new IOException(
                "the long-journal probe bundle is not in the test APK - run tests/android-tier/run.mjs, "
                    + "which builds it, or set ANDROID_TIER_PROBE=long-journal and run vite build manually");
        }
        return target;
    }

    /** Deletes the benchmark database and photo directory so each run starts fresh. */
    private static void deleteProbeArtifacts() {
        Context app = InstrumentationRegistry.getInstrumentation().getTargetContext();
        app.deleteDatabase(PROBE_DATABASE);

        // The probe writes photos to app-private files under long-journal-photos/.
        // Delete that directory so a re-run does not measure leftover data.
        File photosDir = new File(app.getFilesDir(), "long-journal-photos");
        deleteRecursively(photosDir);
    }

    private static void copyAssetDirectory(AssetManager assets, String path, File target) throws IOException {
        String[] children = assets.list(path);
        if (children == null || children.length == 0) {
            copyAssetFile(assets, path, target);
            return;
        }
        if (!target.exists() && !target.mkdirs()) throw new IOException("could not create " + target);
        for (String child : children) {
            copyAssetDirectory(assets, path + "/" + child, new File(target, child));
        }
    }

    private static void copyAssetFile(AssetManager assets, String path, File target) throws IOException {
        File parent = target.getParentFile();
        if (parent != null && !parent.exists() && !parent.mkdirs()) {
            throw new IOException("could not create " + parent);
        }
        try (InputStream in = assets.open(path);
             OutputStream out = new FileOutputStream(target)) {
            byte[] buffer = new byte[8192];
            int read;
            while ((read = in.read(buffer)) != -1) out.write(buffer, 0, read);
        }
    }

    private static void deleteRecursively(File file) {
        if (file == null) return;
        File[] children = file.listFiles();
        if (children != null) for (File child : children) deleteRecursively(child);
        file.delete();
    }
}
