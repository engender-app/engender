package dev.engender.app.backup;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import android.content.ContentResolver;
import android.content.Context;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.net.Uri;
import android.provider.DocumentsContract;
import android.system.Os;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import dev.engender.app.MainActivity;
import dev.engender.app.webview.WebViewProbe;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.nio.file.Files;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class AutoExportDeliveryTest {
    private final Context app = InstrumentationRegistry.getInstrumentation().getTargetContext();
    private final Uri tree = DocumentsContract.buildTreeDocumentUri(BackupDocumentsProvider.AUTHORITY, "root");
    private final ContentResolver resolver = app.getContentResolver();

    @Test public void completeLargeBackupRoundTripsAndFailuresPreserveRecovery() throws Exception {
        java.util.concurrent.CountDownLatch bootstrapped = new java.util.concurrent.CountDownLatch(1);
        app.sendOrderedBroadcast(new android.content.Intent().setComponent(new android.content.ComponentName(
            InstrumentationRegistry.getInstrumentation().getContext().getPackageName(), BackupDocumentsProvider.Bootstrap.class.getName()))
                .putExtra("targetPackage", app.getPackageName()), null,
            new android.content.BroadcastReceiver() {
                @Override public void onReceive(Context context, android.content.Intent intent) { bootstrapped.countDown(); }
            }, null, 0, null, null);
        assertTrue(bootstrapped.await(10, java.util.concurrent.TimeUnit.SECONDS));
        SharedPreferences preferences = app.getSharedPreferences(AutoExportPlugin.PREFS, Context.MODE_PRIVATE);
        preferences.edit().clear().putBoolean("enabled", true).putString("schedule", "weekly")
            .putString("destinationUri", tree.toString()).putLong("lastSuccessAt", 17).commit();
        File bundle = new File(app.getFilesDir(), "auto-export-probe");
        copyAssets("auto-export-probe", bundle);
        File delivered = new File(bundle, "delivered.ttbackup");

        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            scenario.onActivity(activity -> activity.getBridge().setServerBasePath(bundle.getAbsolutePath()));
            WebViewProbe probe = new WebViewProbe(scenario, 600);
            probe.awaitTrue("window.backupProbe && window.backupProbe.ready");

            for (String kind : new String[] {"empty", "empty-piece", "interrupted"}) {
                JSONObject invalid = command(probe, "invalid('" + kind + "')");
                assertTrue(invalid.toString(), invalid.has("rejected"));
                assertEquals(17, preferences.getLong("lastSuccessAt", 0));
                assertTrue(documents().isEmpty());
            }

            JSONObject small = command(probe, "run(2)");
            assertEquals(small.toString(), "ok", small.getJSONObject("result").getString("outcome"));
            Uri previous = documents().get(0);
            byte[] previousHash = hash(previous);
            copyDocument(previous, delivered);
            assertEquals(2, command(probe, "recover(2)").getInt("recovered"));
            long success = preferences.getLong("lastSuccessAt", 0);
            assertTrue(success > 17);

            for (String fault : new String[] {"full", "truncated"}) {
                resolver.call(Uri.parse("content://" + BackupDocumentsProvider.AUTHORITY), "fault", fault, null);
                JSONObject failed = command(probe, "run(2)");
                assertEquals(failed.toString(), "failed", failed.getJSONObject("result").getString("outcome"));
                assertTrue(failed.isNull("recorded"));
                assertEquals(success, preferences.getLong("lastSuccessAt", 0));
                assertEquals(1, documents().size());
            }
            resolver.call(Uri.parse("content://" + BackupDocumentsProvider.AUTHORITY), "fault", "none", null);
            assertTrue(MessageDigest.isEqual(previousHash, hash(previous)));
            copyDocument(previous, delivered);
            assertEquals(2, command(probe, "recover(2)").getInt("recovered"));

            JSONObject large = command(probe, "run(386)");
            assertEquals(large.toString(), "ok", large.getJSONObject("result").getString("outcome"));
            List<Uri> documents = documents();
            assertEquals(2, documents.size());
            documents.remove(previous);
            copyDocument(documents.get(0), delivered);
            assertTrue("large proof must exceed encoder ceiling: " + delivered.length(), delivered.length() > 402653166L);
            JSONObject recovered = command(probe, "recover(386)");
            assertEquals(recovered.toString(), 386, recovered.getInt("recovered"));
            assertEquals(3300, recovered.getInt("rows"));
            android.util.Log.i("AutoExportDeliveryTest", "Recovered " + delivered.length() + " encrypted bytes, 3300 rows, 386 MiB attachments");
            Uri lookalike = DocumentsContract.createDocument(resolver,
                DocumentsContract.buildDocumentUriUsingTree(tree, "root"),
                "application/octet-stream", "auto-backup-legacy.ttbackup");
            Uri manual = DocumentsContract.createDocument(resolver,
                DocumentsContract.buildDocumentUriUsingTree(tree, "root"),
                "application/octet-stream", "manual.ttbackup");
            for (int i = 0; i < 6; i++) {
                JSONObject next = command(probe, "run(1)");
                assertEquals(next.toString(), "ok", next.getJSONObject("result").getString("outcome"));
            }
            List<Uri> retained = documents();
            assertEquals("five verified backups plus two unowned documents", 7, retained.size());
            assertTrue(retained.contains(lookalike));
            assertTrue(retained.contains(manual));
            assertFalse(retained.contains(previous));
            resolver.call(Uri.parse("content://" + BackupDocumentsProvider.AUTHORITY), "fault", "truncated", null);
            JSONObject failedAtLimit = command(probe, "run(1)");
            assertEquals("failed", failedAtLimit.getJSONObject("result").getString("outcome"));
            assertEquals(new java.util.HashSet<>(retained), new java.util.HashSet<>(documents()));
            resolver.call(Uri.parse("content://" + BackupDocumentsProvider.AUTHORITY), "fault", "none", null);

            resolver.call(Uri.parse("content://" + BackupDocumentsProvider.AUTHORITY), "fault", "blocked", null);
            probe.evaluate("window.backupProbe.run(1)");
            long blockedDeadline = System.nanoTime() + java.util.concurrent.TimeUnit.SECONDS.toNanos(10);
            while (!resolver.call(Uri.parse("content://" + BackupDocumentsProvider.AUTHORITY), "blocked", null, null)
                    .getBoolean("blocked") && System.nanoTime() < blockedDeadline) Thread.sleep(50);
            assertTrue("destination write did not pause after staging preparation",
                resolver.call(Uri.parse("content://" + BackupDocumentsProvider.AUTHORITY), "blocked", null, null)
                    .getBoolean("blocked"));
            String cachePath = app.getCacheDir().getAbsolutePath();
            int cacheMode = Os.stat(cachePath).st_mode & 0777;
            try {
                // The prepared archive remains readable, but unlink must fail.
                Os.chmod(cachePath, 0500);
                resolver.call(Uri.parse("content://" + BackupDocumentsProvider.AUTHORITY), "release", null, null);
                probe.awaitTrue("window.backupProbe.ready");
                String raw = probe.evaluate("JSON.stringify(window.backupProbe.result)");
                JSONObject cleanupFailure = new JSONObject(new JSONArray("[" + raw + "]").getString(0));
                List<Uri> afterCleanup = documents();
                assertEquals("staging cleanup must preserve five verified backups plus two unowned documents",
                    7, afterCleanup.size());
                assertEquals(cleanupFailure.toString(), "ok", cleanupFailure.getJSONObject("result").getString("outcome"));
                assertFalse(cleanupFailure.isNull("recorded"));
                assertTrue(afterCleanup.contains(lookalike));
                assertTrue(afterCleanup.contains(manual));
                afterCleanup.removeAll(retained);
                assertEquals(1, afterCleanup.size());
                copyDocument(afterCleanup.get(0), delivered);
                assertEquals(1, command(probe, "recover(1)").getInt("recovered"));
                assertTrue("the fixture must leave staging behind", new File(app.getCacheDir(), "auto-export.pending").exists());
            } finally {
                Os.chmod(cachePath, cacheMode);
                resolver.call(Uri.parse("content://" + BackupDocumentsProvider.AUTHORITY), "fault", "none", null);
                Files.deleteIfExists(new File(app.getCacheDir(), "auto-export.pending").toPath());
            }

            assertFalse(new File(app.getCacheDir(), "auto-export.pending").exists());
        } finally {
            resolver.call(Uri.parse("content://" + BackupDocumentsProvider.AUTHORITY), "reset", null, null);
            Files.deleteIfExists(delivered.toPath());
            AutoExportPlugin.wipe(app);
        }
    }

    private JSONObject command(WebViewProbe probe, String expression) throws Exception {
        probe.evaluate("window.backupProbe." + expression);
        probe.awaitTrue("window.backupProbe.ready");
        String raw = probe.evaluate("JSON.stringify(window.backupProbe.result)");
        return new JSONObject(new JSONArray("[" + raw + "]").getString(0));
    }

    private List<Uri> documents() throws Exception {
        List<Uri> found = new ArrayList<>();
        Uri children = DocumentsContract.buildChildDocumentsUriUsingTree(tree, "root");
        try (Cursor cursor = resolver.query(children, new String[] {DocumentsContract.Document.COLUMN_DOCUMENT_ID}, null, null, null)) {
            while (cursor.moveToNext()) found.add(DocumentsContract.buildDocumentUriUsingTree(tree, cursor.getString(0)));
        }
        return found;
    }

    private byte[] hash(Uri uri) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        try (InputStream input = resolver.openInputStream(uri)) {
            byte[] buffer = new byte[8192];
            int read;
            while ((read = input.read(buffer)) != -1) digest.update(buffer, 0, read);
        }
        return digest.digest();
    }

    private void copyDocument(Uri uri, File target) throws Exception {
        try (InputStream input = resolver.openInputStream(uri); FileOutputStream output = new FileOutputStream(target)) {
            byte[] buffer = new byte[8192];
            int read;
            while ((read = input.read(buffer)) != -1) output.write(buffer, 0, read);
        }
    }

    private void copyAssets(String path, File target) throws Exception {
        android.content.res.AssetManager assets = InstrumentationRegistry.getInstrumentation().getContext().getAssets();
        String[] children = assets.list(path);
        if (children.length > 0) {
            target.mkdirs();
            for (String child : children) copyAssets(path + "/" + child, new File(target, child));
        } else {
            try (InputStream input = assets.open(path); FileOutputStream output = new FileOutputStream(target)) {
                byte[] buffer = new byte[8192];
                int read;
                while ((read = input.read(buffer)) != -1) output.write(buffer, 0, read);
            }
        }
    }
}
