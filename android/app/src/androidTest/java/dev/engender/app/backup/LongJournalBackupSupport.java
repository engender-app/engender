package dev.engender.app.backup;

import static org.junit.Assert.*;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Debug;
import android.os.SystemClock;
import android.provider.DocumentsContract;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.File;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.file.Files;
import java.security.MessageDigest;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import org.json.JSONArray;
import org.json.JSONObject;

/** Disposable benchmark destination; production worker owns delivery. */
public final class LongJournalBackupSupport {
    private final Context app = InstrumentationRegistry.getInstrumentation().getTargetContext();
    private final Uri provider = Uri.parse("content://" + BackupDocumentsProvider.AUTHORITY);
    private final Uri tree = DocumentsContract.buildTreeDocumentUri(BackupDocumentsProvider.AUTHORITY, "root");

    private long previousSuccess;

    public void configure() throws Exception {
        AutoExportPlugin.wipe(app);
        CountDownLatch granted = new CountDownLatch(1);
        app.sendOrderedBroadcast(new Intent().setComponent(new android.content.ComponentName(
            InstrumentationRegistry.getInstrumentation().getContext().getPackageName(), BackupDocumentsProvider.Bootstrap.class.getName()))
            .putExtra("targetPackage", app.getPackageName()), null, new android.content.BroadcastReceiver() {
                @Override public void onReceive(Context context, Intent intent) { granted.countDown(); }
            }, null, 0, null, null);
        assertTrue("benchmark destination bootstrap", granted.await(10, TimeUnit.SECONDS));
        app.getContentResolver().takePersistableUriPermission(tree,
            Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
        synchronized (BackupWork.OWNER) {
            previousSuccess = System.currentTimeMillis() - 7 * BackupWork.DAY + 180_000;
            assertTrue(BackupWork.preferences(app).edit().putBoolean("enabled", true).putString("schedule", "weekly")
                .putString("destinationUri", tree.toString()).putLong("lastSuccessAt", previousSuccess).commit());
            // Future natural due keeps scheduled finish staged until the worker is due.
            assertTrue(BackupWork.due(BackupWork.preferences(app)) > System.currentTimeMillis());
        }
    }

    public JSONObject deliver(File probe) throws Exception {
        SharedPreferences preferences = BackupWork.preferences(app);
        JSONObject stage;
        long bytes;
        String digest;
        synchronized (BackupWork.OWNER) {
            assertTrue("scheduled producer persisted stage", preferences.contains("encryptedStage"));
            assertEquals("staging must not report success", previousSuccess, preferences.getLong("lastSuccessAt", -1));
            stage = new JSONObject(preferences.getString("encryptedStage", "{}"));
            assertEquals("staged due identity", BackupWork.due(preferences), stage.getLong("due"));
            File staged = new File(PersistentBackup.directory(app), stage.getString("file"));
            bytes = staged.length();
            assertEquals(stage.getLong("length"), bytes);
            try (InputStream input = Files.newInputStream(staged.toPath())) { digest = hash(input); }
            assertEquals(stage.getString("sha256"), digest);
            // The same owner and WorkManager path used after foreground exit.
            BackupWork.schedule(app);
        }
        long startedAt = SystemClock.elapsedRealtime();
        int beforePss = pss();
        int maxPss = beforePss;
        int samples = 1;
        long remainingDueMs = Math.max(0, stage.getLong("due") - System.currentTimeMillis());
        long deadline = startedAt + remainingDueMs + 180_000;
        while (preferences.contains("encryptedStage") && SystemClock.elapsedRealtime() < deadline) {
            maxPss = Math.max(maxPss, pss());
            samples++;
            Thread.sleep(100);
        }
        long deliveryMs = SystemClock.elapsedRealtime() - startedAt;
        assertFalse("worker did not finish staged delivery: " + preferences.getString("lastFailureReason", "none"), preferences.contains("encryptedStage"));
        assertTrue("worker success timestamp", preferences.getLong("lastSuccessAt", 0) > previousSuccess);
        assertEquals(stage.getLong("snapshotAt"), preferences.getLong("lastSnapshotAt", -1));
        JSONArray verified = new JSONArray(preferences.getString("verifiedBackups", "[]"));
        assertEquals("one verified destination", 1, verified.length());
        Uri destination = Uri.parse(verified.getString(0));
        File delivered = new File(probe, "delivered.ttbackup");
        try (InputStream input = app.getContentResolver().openInputStream(destination);
             OutputStream output = Files.newOutputStream(delivered.toPath())) {
            byte[] buffer = new byte[8192];
            int count;
            while ((count = input.read(buffer)) != -1) output.write(buffer, 0, count);
        }
        assertEquals("delivered Archive length", bytes, delivered.length());
        try (InputStream input = Files.newInputStream(delivered.toPath())) { assertEquals("delivered Archive digest", digest, hash(input)); }
        return new JSONObject().put("bytes", bytes).put("sha256", digest).put("snapshotAt", stage.getLong("snapshotAt"))
            .put("naturalDueAt", stage.getLong("due")).put("deliveredAt", preferences.getLong("lastSuccessAt", 0))
            .put("scheduledWaitAndDeliveryMs", deliveryMs).put("processPssBeforeKiB", beforePss).put("processPssAfterKiB", pss())
            .put("processPssSampledMaxKiB", maxPss).put("processPssSamples", samples)
            .put("memoryLimits", "100ms process PSS samples while waiting for natural due and worker delivery; excludes staging peak and may miss transient allocations; not a heap bound");
    }

    private static int pss() {
        Debug.MemoryInfo memory = new Debug.MemoryInfo();
        Debug.getMemoryInfo(memory);
        return memory.getTotalPss();
    }

    private static String hash(InputStream input) throws Exception {
        MessageDigest hash = MessageDigest.getInstance("SHA-256");
        byte[] buffer = new byte[8192];
        int count;
        while ((count = input.read(buffer)) != -1) hash.update(buffer, 0, count);
        StringBuilder result = new StringBuilder();
        for (byte value : hash.digest()) result.append(String.format("%02x", value & 255));
        return result.toString();
    }

    public void cleanup() throws Exception {
        AutoExportPlugin.wipe(app);
        app.getContentResolver().call(provider, "reset", null, null);
    }
}
