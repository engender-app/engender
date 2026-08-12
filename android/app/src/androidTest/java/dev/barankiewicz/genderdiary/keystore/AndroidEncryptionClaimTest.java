package dev.barankiewicz.genderdiary.keystore;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

import android.content.Context;
import android.content.res.AssetManager;
import android.util.Log;

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
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

/**
 * The at-rest encryption claim on Android (ticket 13's sixth box), proved the
 * way ticket 09 proved it on the web: seed protected content of every kind
 * the claim names, close the app, and then read the raw bytes of everything
 * it left behind.
 *
 * <p>The reading is why this is a Java test rather than another WebView
 * probe. What has to be scanned is the app's own private directory - the
 * SQLCipher database, its side files, ADR-0006's copy, and the WebView's own
 * storage where the photo files sit - and a WebView cannot see any of that.
 * So {@code tests/android-tier/encryption/encryption-probe.ts} seeds and
 * closes, and this walks the directory afterwards.
 *
 * <p>Two things are deliberately skipped by the walk, and both are named
 * below with the reason. Everything else is scanned byte for byte, including
 * files nothing in this repository wrote.
 */
@RunWith(AndroidJUnit4.class)
public class AndroidEncryptionClaimTest {

    private static final String TAG = "EncryptionClaim";

    /** Where run.mjs puts the built probe inside the test APK. */
    private static final String PROBE_ASSETS = "encryption-probe";

    /** Where it is unpacked to, and the first thing the scan skips: it is the
        probe's own source, and it names every sentinel below in plain text.
        A release build has nothing like it. */
    private static final String PROBE_DIR = "encryption-probe";

    /** The database encryption-probe.ts opens, and its photo directory. */
    private static final String PROBE_DATABASE = "encryption-probe.sqlite3";

    private static final long RESULT_TIMEOUT_SECONDS = 180;

    /**
     * The strings the probe wrote into the journal. Identical to the ones in
     * encryption-probe.ts; they are repeated rather than shared because the
     * only way to share them would be through the probe bundle, which is the
     * one thing the scan cannot read.
     */
    private static final String[] SENTINELS = {
        "sentinel-note-woke-up-early-9351",
        "sentinel-analyte-estradiol",
        "sentinel-unit-pg/mL",
        "sentinel-reminder-progynova-2114",
        "sentinel-milestone-first-day-7738",
        "sentinel-photo-body-6627"
    };

    /** A JPEG's opening bytes. A photo file that still starts with these was
        not encrypted, whatever else is in it. */
    private static final byte[] JPEG_SIGNATURE = {(byte) 0xff, (byte) 0xd8, (byte) 0xff, (byte) 0xe0};

    @Test
    public void aClosedAppLeavesNothingReadableBehind() throws Exception {
        File probeDir = unpackProbe();
        deleteProbeDatabase();

        JSONObject result;
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            scenario.onActivity(activity -> activity.getBridge().setServerBasePath(probeDir.getAbsolutePath()));
            result = new JSONObject(awaitResult(scenario));
        }

        if (result.has("error")) fail("the probe failed before it could report: " + result.getString("error"));

        /* The journal worked while it was open, or the scan below would be
           proving only that nothing was written. */
        assertEquals(
            "the note did not come back through the encrypted journal",
            SENTINELS[0],
            result.getString("reopenedNote"));
        assertTrue(
            "search found nothing in the encrypted index",
            result.getInt("searchHitsWhileOpen") > 0);
        assertTrue(
            "the photo did not come back as a JPEG through the file store",
            result.getBoolean("photoIsAJpegThroughTheStore"));

        // --- and now the bytes a thief with the phone would read ------------
        Context app = InstrumentationRegistry.getInstrumentation().getTargetContext();
        File dataDir = app.getDatabasePath(PROBE_DATABASE).getParentFile().getParentFile();

        List<String> scanned = new ArrayList<>();
        List<String> leaks = new ArrayList<>();
        scan(dataDir, probeDir, scanned, leaks);

        Log.i(TAG, "scanned " + scanned.size() + " files under " + dataDir + ": " + scanned);
        assertTrue(
            "the scan found no files at all, so it proved nothing", !scanned.isEmpty());
        /* Named so a scan that silently stopped covering the journal fails
           rather than passes: the database and its pre-migration copy are the
           two files the claim is most about. */
        assertTrue(
            "the encrypted database was not among the scanned files: " + scanned,
            scanned.stream().anyMatch(path -> path.endsWith(PROBE_DATABASE)));
        assertTrue(
            "ADR-0006's pre-migration copy was not among the scanned files: " + scanned,
            scanned.stream().anyMatch(path -> path.contains(PROBE_DATABASE + ".pre-migration-backup")));

        assertTrue("protected content is readable on disk: " + leaks, leaks.isEmpty());
    }

    /** Walks everything under the app's data directory, skipping only what is
        named here, and records any file holding protected content. */
    private static void scan(File file, File probeDir, List<String> scanned, List<String> leaks)
        throws IOException {
        if (file.equals(probeDir)) return; // the probe's own source; see PROBE_DIR
        if (file.isDirectory()) {
            File[] children = file.listFiles();
            if (children != null) for (File child : children) scan(child, probeDir, scanned, leaks);
            return;
        }
        /* Code and assets rather than data: the app's own bundle is where the
           app's strings live, and none of it is journal content. Skipped by
           extension rather than by directory so a WebView cache of the bundle
           is skipped too. */
        String name = file.getName();
        if (name.endsWith(".js") || name.endsWith(".css") || name.endsWith(".html") || name.endsWith(".map")) {
            return;
        }

        byte[] bytes;
        try {
            bytes = Files.readAllBytes(file.toPath());
        } catch (IOException unreadable) {
            // A socket, a pipe, or a file the platform holds. Nothing a thief
            // copying the directory would get either.
            Log.i(TAG, "skipped unreadable " + file + ": " + unreadable.getMessage());
            return;
        }
        scanned.add(file.getPath());

        for (String sentinel : SENTINELS) {
            if (indexOf(bytes, sentinel.getBytes(StandardCharsets.UTF_8)) >= 0) {
                leaks.add(sentinel + " in " + file.getPath());
            }
        }
        if (bytes.length >= JPEG_SIGNATURE.length && startsWith(bytes, JPEG_SIGNATURE)) {
            leaks.add("a plain JPEG at " + file.getPath());
        }
    }

    /* --- the probe, launched and awaited ----------------------------------- */

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
                            "document.body && document.body.dataset.encryptionProbeReady === 'true'"
                                + " ? JSON.stringify(window.__encryptionProbeResult) : ''",
                            answer -> {
                                value.set(answer);
                                evaluated.countDown();
                            }));

            if (!evaluated.await(30, TimeUnit.SECONDS)) throw new AssertionError("the WebView stopped answering");

            String json = unquote(value.get());
            if (json != null && !json.isEmpty()) return json;
            Thread.sleep(500);
        }

        throw new AssertionError(
            "the probe did not report within " + RESULT_TIMEOUT_SECONDS + "s; check logcat for its errors");
    }

    private static String unquote(String evaluated) {
        if (evaluated == null || evaluated.equals("null") || evaluated.equals("\"\"")) return null;
        try {
            return new JSONArray("[" + evaluated + "]").getString(0);
        } catch (Exception e) {
            return null;
        }
    }

    /** Clears the probe's database and its side files, so every run seeds and
        migrates a fresh one rather than reopening the last run's. */
    private static void deleteProbeDatabase() {
        Context app = InstrumentationRegistry.getInstrumentation().getTargetContext();
        File database = app.getDatabasePath(PROBE_DATABASE);
        for (String suffix : new String[] {"", "-wal", "-shm", "-journal", ".pre-migration-backup"}) {
            File file = new File(database.getPath() + suffix);
            if (file.exists() && !file.delete()) Log.w(TAG, "could not delete " + file);
        }
    }

    private static File unpackProbe() throws IOException {
        Context test = InstrumentationRegistry.getInstrumentation().getContext();
        Context app = InstrumentationRegistry.getInstrumentation().getTargetContext();

        File target = new File(app.getFilesDir(), PROBE_DIR);
        deleteRecursively(target);
        if (!target.mkdirs()) throw new IOException("could not create " + target);

        copyAssetDirectory(test.getAssets(), PROBE_ASSETS, target);

        File index = new File(target, "index.html");
        if (!index.exists()) {
            throw new IOException(
                "the encryption probe bundle is not in the test APK - run tests/android-tier/run.mjs, "
                    + "which builds it");
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

    private static boolean startsWith(byte[] bytes, byte[] prefix) {
        for (int i = 0; i < prefix.length; i++) if (bytes[i] != prefix[i]) return false;
        return true;
    }

    private static int indexOf(byte[] haystack, byte[] needle) {
        outer:
        for (int i = 0; i + needle.length <= haystack.length; i++) {
            for (int j = 0; j < needle.length; j++) {
                if (haystack[i + j] != needle[j]) continue outer;
            }
            return i;
        }
        return -1;
    }
}
