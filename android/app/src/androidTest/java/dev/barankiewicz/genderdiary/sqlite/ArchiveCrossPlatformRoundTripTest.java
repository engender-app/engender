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
 * Ticket 17: one archive format, both directions.
 *
 * <p>The probe this test serves boots both stacks in one Android app run:
 * the web stack (OPFS + web sqlite path) and the Android stack (native
 * SQLCipher + app-private files). It exports and imports archives both ways
 * under both encryption layouts, then reports structured checks.
 */
@RunWith(AndroidJUnit4.class)
public class ArchiveCrossPlatformRoundTripTest {

    /** Where tests/android-tier/run.mjs puts the built probe in the test APK. */
    private static final String PROBE_ASSETS = "archive-cross-probe";

    /** More work than the basic contract suite: several exports/imports. */
    private static final long RESULT_TIMEOUT_SECONDS = 240;

    @Test
    public void archiveRoundTripsAcrossWebAndAndroidInBothDirections() throws Exception {
        File probeDir = unpackProbe();

        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            scenario.onActivity(activity -> activity.getBridge().setServerBasePath(probeDir.getAbsolutePath()));

            String raw = awaitResult(scenario);
            JSONObject result = new JSONObject(raw);
            if (result.has("error")) {
                fail("the archive probe failed before it could report: " + result.getString("error"));
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
                "cross-platform archive checks failed: " + failures,
                failures.isEmpty());
            // Guard against an empty or truncated report falsely passing.
            // 6 direction/encryption cases x 7 checks each = 42 checks.
            assertTrue(
                "expected ticket 17 coverage checks, got " + checks.length(),
                checks.length() >= 42);
        }
    }

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
                            "document.body && document.body.dataset.archiveCrossReady === 'true'"
                                + " ? JSON.stringify(window.__archiveCrossResult) : ''",
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
            "the archive probe did not report within " + RESULT_TIMEOUT_SECONDS + "s; check logcat for its errors");
    }

    private static String unquote(String evaluated) {
        if (evaluated == null || evaluated.equals("null") || evaluated.equals("\"\"")) return null;
        try {
            return new JSONArray("[" + evaluated + "]").getString(0);
        } catch (Exception e) {
            return null;
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
                "the archive probe bundle is not in the test APK - run tests/android-tier/run.mjs, which builds it");
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
