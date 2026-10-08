package dev.engender.app.backup;

import static org.junit.Assert.*;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import androidx.test.core.app.ActivityScenario;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.work.WorkManager;
import dev.engender.app.MainActivity;
import dev.engender.app.webview.WebViewProbe;
import java.io.File;
import java.util.concurrent.TimeUnit;
import org.json.JSONObject;
import org.junit.Test;

/** Runner separates these phases with actual process termination and reboot. */
public class NativeBackupSchedulingTest extends AutoExportDeliveryTest {
    @Test public void persistentDeliverySurvivesLifecycle() throws Exception {
        String phase = InstrumentationRegistry.getArguments().getString("backupStage");
        org.junit.Assume.assumeNotNull(phase);
        SharedPreferences preferences = BackupWork.preferences(app);
        File bundle = new File(app.getFilesDir(), "auto-export-probe");
        if ("cleanup".equals(phase)) {
            InstrumentationRegistry.getInstrumentation().getContext().getContentResolver()
                .call(Uri.parse("content://" + BackupDocumentsProvider.AUTHORITY), "reset", null, null);
            AutoExportPlugin.wipe(app);
            assertFalse(preferences.contains("encryptedStage"));
            assertTrue(WorkManager.getInstance(app).getWorkInfosForUniqueWork(BackupWork.NAME).get(10, TimeUnit.SECONDS)
                .stream().allMatch(info -> info.getState().isFinished()));
            return;
        }
        if ("prepare".equals(phase) || "defer".equals(phase)) {
            prepareNativeStage("defer".equals(phase));
            return;
        }
        if ("verify-deferred".equals(phase)) {
            long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(60);
            while (!preferences.contains("deferredAt") && System.nanoTime() < deadline) Thread.sleep(100);
            assertTrue("cold job must record deferral", preferences.contains("deferredAt"));
            assertFalse(preferences.contains("lastSuccessAt"));
            assertTrue(documents().isEmpty());
            assertFalse(preferences.contains("encryptedStage"));
            return;
        }
        assertEquals("verify", phase);
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(120);
        while (preferences.getLong("lastSuccessAt", 0) == preferences.getLong("proofPreviousSuccess", 0)
            && System.nanoTime() < deadline) Thread.sleep(100);
        assertTrue("native delivery did not verify", preferences.getLong("lastSuccessAt", 0) > preferences.getLong("proofPreviousSuccess", 0));
        assertEquals(preferences.getLong("proofSnapshotAt", 0), preferences.getLong("lastSnapshotAt", -1));
        assertTrue(preferences.getLong("lastSuccessAt", 0) > preferences.getLong("lastSnapshotAt", 0));
        assertFalse(preferences.contains("encryptedStage"));
        assertEquals(1, documents().size());
        copyDocument(documents().get(0), new File(bundle, "delivered.ttbackup"));
        // Delivery is established before any foreground page is created for restore.
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            scenario.onActivity(activity -> activity.getBridge().setServerBasePath(bundle.getAbsolutePath()));
            WebViewProbe probe = new WebViewProbe(scenario, 120);
            probe.awaitTrue("window.backupProbe && window.backupProbe.ready");
            JSONObject restored = command(probe, "recover(2)");
            assertEquals(restored.toString(), 2, restored.getInt("recovered"));
            assertEquals(3300, restored.getInt("rows"));
            assertTrue(restored.getBoolean("decodedImage"));
        }
    }
    @Test public void failuresRetentionAndCancellationUseTheNativeOwner() throws Exception {
        prepareNativeStage(false);
        SharedPreferences preferences = BackupWork.preferences(app);
        JSONObject metadata = new JSONObject(preferences.getString("encryptedStage", "{}"));
        File encrypted = new File(app.getCacheDir(), "native-backup-fixture.ttbackup");
        java.nio.file.Files.copy(new File(PersistentBackup.directory(app), metadata.getString("file")).toPath(),
            encrypted.toPath(), java.nio.file.StandardCopyOption.REPLACE_EXISTING);
        long snapshotAt = metadata.getLong("snapshotAt");
        String digest = metadata.getString("sha256");
        File bundle = new File(app.getFilesDir(), "auto-export-probe");
        try {
            synchronized (BackupWork.OWNER) { assertTrue(PersistentBackup.deliver(app)); }
            Uri previous = documents().get(0);
            byte[] previousBytes = hash(previous);
            long success = preferences.getLong("lastSuccessAt", 0);
            for (String fault : new String[] { "full", "truncated", "unmounted", "blocked" }) {
                stageCiphertext(encrypted, digest, snapshotAt);
                resolver.call(Uri.parse("content://" + BackupDocumentsProvider.AUTHORITY), "fault", fault, null);
                try {
                    synchronized (BackupWork.OWNER) { PersistentBackup.deliver(app); }
                    fail("destination fault was reported successful: " + fault);
                } catch (Exception expected) {
                    assertEquals(success, preferences.getLong("lastSuccessAt", 0));
                    assertTrue(preferences.contains("encryptedStage"));
                    assertTrue(new org.json.JSONArray(preferences.getString("verifiedBackups", "[]")).toString().contains(previous.toString()));
                } finally { resolver.call(Uri.parse("content://" + BackupDocumentsProvider.AUTHORITY), "fault", "none", null); }
                assertArrayEquals(previousBytes, hash(previous));
            }
            stageCiphertext(encrypted, digest, snapshotAt);
            Context provider = InstrumentationRegistry.getInstrumentation().getContext();
            resolver.releasePersistableUriPermission(tree, Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
            provider.revokeUriPermission(tree, Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
            try {
                synchronized (BackupWork.OWNER) { PersistentBackup.deliver(app); }
                fail("revoked destination was reported successful");
            } catch (Exception expected) { assertEquals(success, preferences.getLong("lastSuccessAt", 0)); }
            grantDestination();
            assertArrayEquals(previousBytes, hash(previous));

            // A failed success-state commit must not prune earlier Archives or change memory state.
            File preferenceDirectory = new File(app.getApplicationInfo().dataDir, "shared_prefs");
            int mode = android.system.Os.stat(preferenceDirectory.getAbsolutePath()).st_mode & 0777;
            try {
                android.system.Os.chmod(preferenceDirectory.getAbsolutePath(), 0500);
                try {
                    synchronized (BackupWork.OWNER) { PersistentBackup.deliver(app); }
                    fail("undurable success state was accepted");
                } catch (Exception expected) {
                    assertEquals("backup-state-unavailable", expected.getMessage());
                    assertEquals(success, preferences.getLong("lastSuccessAt", 0));
                    assertTrue(preferences.contains("encryptedStage"));
                }
            } finally { android.system.Os.chmod(preferenceDirectory.getAbsolutePath(), mode); }
            synchronized (BackupWork.OWNER) { assertTrue(PersistentBackup.deliver(app)); }

            Uri unrelated = android.provider.DocumentsContract.createDocument(resolver,
                android.provider.DocumentsContract.buildDocumentUriUsingTree(tree, "root"), "application/octet-stream", "auto-unrelated.ttbackup");
            Uri manual = android.provider.DocumentsContract.createDocument(resolver,
                android.provider.DocumentsContract.buildDocumentUriUsingTree(tree, "root"), "application/octet-stream", "manual.ttbackup");
            for (int i = 0; i < 6; i++) {
                stageCiphertext(encrypted, digest, snapshotAt);
                synchronized (BackupWork.OWNER) { assertTrue(PersistentBackup.deliver(app)); }
            }
            assertEquals(7, documents().size());
            assertTrue(documents().contains(unrelated));
            assertTrue(documents().contains(manual));
            assertEquals(5, new org.json.JSONArray(preferences.getString("verifiedBackups", "[]")).length());
            Uri restoredUri = Uri.parse(new org.json.JSONArray(preferences.getString("verifiedBackups", "[]")).getString(4));
            copyDocument(restoredUri, new File(bundle, "delivered.ttbackup"));

            try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
                scenario.onActivity(activity -> activity.getBridge().setServerBasePath(bundle.getAbsolutePath()));
                WebViewProbe probe = new WebViewProbe(scenario, 120);
                probe.awaitTrue("window.backupProbe && window.backupProbe.ready");
                assertEquals(2, command(probe, "recover(2)").getInt("recovered"));
                assertTrue(command(probe, "hold()").getBoolean("held"));
                assertTrue(BackupWork.foregroundPacking);
                stageCiphertext(encrypted, digest, snapshotAt);
                JSONObject stage = new JSONObject(preferences.getString("encryptedStage", "{}"));
                preferences.edit().remove("lastSuccessAt").putString("encryptedStage", stage.put("due", 0).toString()).commit();
                BackupWork.schedule(app);
                long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(20);
                while (WorkManager.getInstance(app).getWorkInfosForUniqueWork(BackupWork.NAME).get(10, TimeUnit.SECONDS)
                    .stream().noneMatch(info -> info.getRunAttemptCount() > 0) && System.nanoTime() < deadline) Thread.sleep(100);
                assertTrue("native worker did not run against the held transfer", WorkManager.getInstance(app)
                    .getWorkInfosForUniqueWork(BackupWork.NAME).get(10, TimeUnit.SECONDS)
                    .stream().anyMatch(info -> info.getRunAttemptCount() > 0));
                assertFalse("native work must defer to an active foreground transfer", preferences.contains("lastSuccessAt"));
                assertEquals(7, documents().size());
                assertTrue(command(probe, "abortHeld()").getBoolean("aborted"));
                JSONObject raced = command(probe, "concurrent()");
                // command returns an object, so concurrent wraps both outcomes for this assertion.
                org.json.JSONArray outcomes = raced.getJSONArray("outcomes");
                int published = 0;
                for (int i = 0; i < outcomes.length(); i++) if ("ok".equals(outcomes.getJSONObject(i).getString("outcome"))) published++;
                assertEquals(1, published);
                assertEquals(7, documents().size());
                assertFalse(preferences.contains("encryptedStage"));

                stageCiphertext(encrypted, digest, snapshotAt);
                assertTrue(command(probe, "hold()").getBoolean("held"));
                command(probe, "disable()");
                assertTrue(command(probe, "appendHeld()").getString("rejected").contains("backup-configuration-changed"));
                assertFalse(preferences.getBoolean("enabled", false));
                assertFalse(preferences.contains("encryptedStage"));
                assertEquals(0, PersistentBackup.directory(app).list().length);
                command(probe, "abortHeld()");
                assertTrue(command(probe, "hold()").getBoolean("held"));
                AutoExportPlugin.wipe(app);
                assertTrue(command(probe, "appendHeld()").getString("rejected").contains("backup-configuration-changed"));
                command(probe, "abortHeld()");
                assertTrue(preferences.getAll().isEmpty());
            }
        } finally {
            InstrumentationRegistry.getInstrumentation().getContext().getContentResolver()
                .call(Uri.parse("content://" + BackupDocumentsProvider.AUTHORITY), "reset", null, null);
            AutoExportPlugin.wipe(app);
            encrypted.delete();
        }
    }

    private void grantDestination() {
        InstrumentationRegistry.getInstrumentation().getContext().grantUriPermission(app.getPackageName(), tree,
            Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION
                | Intent.FLAG_GRANT_PREFIX_URI_PERMISSION | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
        resolver.takePersistableUriPermission(tree, Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
    }

    private void stageCiphertext(File encrypted, String digest, long snapshotAt) throws Exception {
        synchronized (BackupWork.OWNER) {
            try (StagedBackup staged = new StagedBackup(new File(app.getCacheDir(), "native-backup-fixture.pending"));
                 java.io.InputStream input = new java.io.FileInputStream(encrypted)) {
                byte[] buffer = new byte[1024 * 1024];
                long offset = 0;
                int count;
                while ((count = input.read(buffer)) != -1) {
                    staged.append(offset, java.util.Arrays.copyOf(buffer, count));
                    offset += count;
                }
                staged.prepare(offset, digest);
                PersistentBackup.stage(app, staged, offset, digest, snapshotAt, BackupWork.preferences(app).getLong("backupGeneration", 0));
            }
        }
    }

    private void prepareNativeStage(boolean deferred) throws Exception {
        SharedPreferences preferences = BackupWork.preferences(app);
        File bundle = new File(app.getFilesDir(), "auto-export-probe");

            java.util.concurrent.CountDownLatch ready = new java.util.concurrent.CountDownLatch(1);
            app.sendOrderedBroadcast(new Intent().setComponent(new android.content.ComponentName(
                InstrumentationRegistry.getInstrumentation().getContext().getPackageName(), BackupDocumentsProvider.Bootstrap.class.getName()))
                .putExtra("targetPackage", app.getPackageName()), null, new android.content.BroadcastReceiver() {
                    @Override public void onReceive(Context context, Intent intent) { ready.countDown(); }
                }, null, 0, null, null);
            assertTrue(ready.await(10, TimeUnit.SECONDS));
            resolver.takePersistableUriPermission(tree, Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
            synchronized (BackupWork.OWNER) {
                PersistentBackup.clear(app);
                preferences.edit().clear().putBoolean("enabled", true).putString("schedule", "weekly")
                    .putString("destinationUri", tree.toString()).commit();
            }
            if (deferred) {
                BackupWork.schedule(app);
                return;
            }
            copyAssets("auto-export-probe", bundle);
            try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
                scenario.onActivity(activity -> activity.getBridge().setServerBasePath(bundle.getAbsolutePath()));
                WebViewProbe probe = new WebViewProbe(scenario, 120);
                probe.awaitTrue("window.backupProbe && window.backupProbe.ready");
                synchronized (BackupWork.OWNER) {
                    long last = System.currentTimeMillis() - 7 * BackupWork.DAY + 45000;
                    preferences.edit().putLong("lastSuccessAt", last).putLong("proofPreviousSuccess", last).commit();
                }
                JSONObject result = command(probe, "run(2, true)");
                assertEquals(result.toString(), "staged", result.getJSONObject("result").getString("outcome"));
                JSONObject stage = new JSONObject(preferences.getString("encryptedStage", "{}"));
                preferences.edit().putLong("proofSnapshotAt", stage.getLong("snapshotAt")).commit();
                assertTrue(new File(PersistentBackup.directory(app), stage.getString("file")).isFile());
                assertTrue(documents().isEmpty());
                assertFalse(preferences.contains("lastSnapshotAt"));
                assertTrue(WorkManager.getInstance(app).getWorkInfosForUniqueWork(BackupWork.NAME).get(10, TimeUnit.SECONDS)
                    .stream().anyMatch(info -> !info.getState().isFinished()));
            }
            return;
            }

}
