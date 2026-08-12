package dev.barankiewicz.genderdiary.sqlite;

import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

import android.content.Context;
import android.content.res.AssetManager;

import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import dev.barankiewicz.genderdiary.MainActivity;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Runs the shared driver contract suite on a phone (ticket 11's acceptance:
 * the same journal contract tests, and folded search matching the other
 * tiers, against the native driver).
 *
 * <p>"The same tests" is meant literally. The checks live in
 * src/lib/data/journal/contract-suite.ts and the Node tier runs them over
 * node:sqlite in contract-suite.test.ts; this loads a bundle of that same
 * module into the app's own WebView, over the app's own bridge and the real
 * SqlitePlugin, and fails with whatever the suite reports.
 *
 * <p>The bundle is built by tests/android-tier/run.mjs and shipped as an
 * androidTest asset. Bridge.setServerBasePath is what points the WebView at
 * it - the same hook a live update would use - so nothing about the probe
 * has to be present in a release build.
 */
@RunWith(AndroidJUnit4.class)
public class JournalContractTest {

    /** Where run.mjs puts the built probe inside the test APK. */
    private static final String PROBE_ASSETS = "probe";

    /** The suite writes and searches a few hundred rows on an emulator. */
    private static final long RESULT_TIMEOUT_SECONDS = 120;

    /** The database contract-probe.ts opens, deleted so each run starts fresh. */
    private static final String PROBE_DATABASE = "contract-probe.sqlite3";

    @Test
    public void theNativeDriverPassesTheSharedContractSuite() throws Exception {
        File probeDir = unpackProbe();
        deleteProbeDatabase();

        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            scenario.onActivity(activity -> activity.getBridge().setServerBasePath(probeDir.getAbsolutePath()));

            String raw = awaitResult(scenario);
            JSONObject result = new JSONObject(raw);

            if (result.has("error")) {
                fail("the probe failed before it could report: " + result.getString("error"));
            }

            JSONArray checks = result.getJSONArray("checks");
            List<String> failures = new ArrayList<>();
            for (int i = 0; i < checks.length(); i++) {
                JSONObject check = checks.getJSONObject(i);
                if (!check.getBoolean("ok")) {
                    failures.add(check.getString("name") + ": " + check.getString("detail"));
                }
            }

            assertTrue(
                "the native driver failed " + failures.size() + " contract check(s): " + failures,
                failures.isEmpty());
            // A suite that stopped collecting would otherwise pass by reporting nothing.
            assertTrue(
                "expected the whole suite to run, got " + checks.length() + " checks",
                checks.length() >= 20);
        }
    }

    /**
     * Polls the WebView for the probe's result. Polling rather than a
     * JavascriptInterface: the probe is a plain module that publishes to
     * `window`, which is what lets the browser tier read it the same way.
     */
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
                            "document.body && document.body.dataset.contractReady === 'true'"
                                + " ? JSON.stringify(window.__contractResult) : ''",
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
            "the probe did not report within " + RESULT_TIMEOUT_SECONDS + "s; check logcat for its errors");
    }

    /**
     * evaluateJavascript hands back a JSON-encoded value, so a string result
     * arrives quoted and escaped one level deeper than it was written.
     */
    private static String unquote(String evaluated) {
        if (evaluated == null || evaluated.equals("null") || evaluated.equals("\"\"")) return null;
        try {
            return new JSONArray("[" + evaluated + "]").getString(0);
        } catch (Exception e) {
            return null;
        }
    }

    /**
     * Clears the probe's database and its side files, so the suite always
     * opens an empty one and runs its migrations for real. Deleting rather
     * than opening a uniquely named database each time, which would leave one
     * behind in app storage on every run.
     */
    private static void deleteProbeDatabase() {
        Context app = InstrumentationRegistry.getInstrumentation().getTargetContext();
        File database = app.getDatabasePath(PROBE_DATABASE);
        for (String suffix : new String[] {"", "-wal", "-shm", "-journal", ".pre-migration-backup"}) {
            File file = new File(database.getPath() + suffix);
            if (file.exists()) file.delete();
        }
    }

    /**
     * Copies the probe bundle out of the test APK's assets and into the app's
     * own files directory, which is where the WebView can serve it from.
     */
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
                "the probe bundle is not in the test APK - run tests/android-tier/run.mjs, which builds it");
        }
        return target;
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
        File[] children = file.listFiles();
        if (children != null) for (File child : children) deleteRecursively(child);
        file.delete();
    }
}
