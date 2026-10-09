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
            grantDestination();
            InstrumentationRegistry.getInstrumentation().getContext().getContentResolver()
                .call(Uri.parse("content://" + BackupDocumentsProvider.AUTHORITY), "reset", null, null);
            AutoExportPlugin.wipe(app);
            assertFalse(preferences.contains("encryptedStage"));
            assertTrue(WorkManager.getInstance(app).getWorkInfosForUniqueWork(BackupWork.NAME).get(10, TimeUnit.SECONDS)
                .stream().allMatch(info -> info.getState().isFinished()));
            return;
        }
        if ("prepare".equals(phase) || "prepare-interrupted".equals(phase) || "defer".equals(phase)) {
            prepareNativeStage("defer".equals(phase));
            if ("prepare-interrupted".equals(phase)) {
                preferences.edit().putString("proofJournalHash", journalFileHash()).commit();
                resolver.call(Uri.parse("content://" + BackupDocumentsProvider.AUTHORITY), "fault", "interrupted-write", null);
            }
            return;
        }
        if ("verify-deferred".equals(phase)) {
            long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(60);
            while (!preferences.contains("deferredAt") && System.nanoTime() < deadline) Thread.sleep(100);
            assertTrue("cold job must record deferral", preferences.contains("deferredAt"));
            assertEquals(preferences.getLong("proofPreviousSuccess", 0), preferences.getLong("lastSuccessAt", 0));
            assertTrue(documents().isEmpty());
            assertFalse(preferences.contains("encryptedStage"));
            return;
        }
        if ("resume-interrupted".equals(phase)) {
            grantDestination();
            JSONObject stage = new JSONObject(preferences.getString("encryptedStage", "{}"));
            assertTrue(stage.has("target"));
            assertEquals(1, documents().size());
            assertEquals(preferences.getString("proofJournalHash", null), journalFileHash());
            preferences.edit().putString("proofInterruptedTarget", stage.getString("target")).commit();
            resolver.call(Uri.parse("content://" + BackupDocumentsProvider.AUTHORITY), "fault", "none", null);
            BackupWork.schedule(app);
            return;
        }
        if ("catch-up".equals(phase)) {
            try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
                scenario.onActivity(activity -> activity.getBridge().setServerBasePath(bundle.getAbsolutePath()));
                WebViewProbe probe = new WebViewProbe(scenario, 120);
                probe.awaitTrue("window.backupProbe && window.backupProbe.ready");
                JSONObject result = command(probe, "catchUpProtected()");
                assertTrue(result.toString(), result.getBoolean("authenticated"));
                assertTrue(result.getBoolean("wrongSecretRejected"));
                assertTrue(result.getBoolean("liveJournalPreserved"));
                assertEquals(result.getLong("capturedAt"), result.getLong("backupAgeAt"));
                assertTrue(result.getLong("deliveredAt") >= result.getLong("capturedAt"));
                assertEquals(1, documents().size());
                copyDocument(documents().get(0), new File(bundle, "delivered.ttbackup"));
                JSONObject restored = command(probe, "recoverProtected()");
                assertTrue(restored.toString(), restored.getBoolean("currentRows"));
                assertEquals(2, restored.getInt("attachments"));
                assertTrue(restored.getBoolean("decodedImage"));
                assertTrue(restored.getBoolean("publicRestore"));
                System.out.println("Protected catch-up evidence: " + result);
            }
            return;
        }
        assertEquals("verify", phase);
        if (preferences.contains("proofJournalHash")) {
            assertEquals(preferences.getString("proofJournalHash", null), journalFileHash());
            assertEquals(1, documents().size());
            assertEquals(preferences.getString("proofInterruptedTarget", null), documents().get(0).toString());
        }

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
                    assertEquals(previous.toString(), new org.json.JSONArray(preferences.getString("verifiedBackups", "[]")).getString(0));
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

            resolver.call(Uri.parse("content://" + BackupDocumentsProvider.AUTHORITY), "fault", "truncated", null);
            try {
                synchronized (BackupWork.OWNER) { PersistentBackup.deliver(app); }
                fail("truncated target accepted");
            } catch (Exception expected) {
                assertTrue(new JSONObject(preferences.getString("encryptedStage", "{}")).has("target"));
            } finally { resolver.call(Uri.parse("content://" + BackupDocumentsProvider.AUTHORITY), "fault", "none", null); }

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
                stageCiphertext(encrypted, digest, snapshotAt);
                String stagedBefore = preferences.getString("encryptedStage", null);
                long generationBefore = preferences.getLong("backupGeneration", 0);
                try {
                    android.system.Os.chmod(preferenceDirectory.getAbsolutePath(), 0500);
                    assertTrue(command(probe, "disable()").getString("rejected").contains("backup-state-unavailable"));
                    assertTrue(preferences.getBoolean("enabled", false));
                    assertEquals(generationBefore, preferences.getLong("backupGeneration", 0));
                    try {
                        synchronized (BackupWork.OWNER) { PersistentBackup.clear(app); }
                        fail("undurable stage clear accepted");
                    } catch (IllegalStateException expected) {
                        assertEquals("backup-state-unavailable", expected.getMessage());
                    }
                    assertEquals(stagedBefore, preferences.getString("encryptedStage", null));
                    assertEquals(1, PersistentBackup.directory(app).list().length);
                } finally { android.system.Os.chmod(preferenceDirectory.getAbsolutePath(), mode); }

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
            grantDestination();
            InstrumentationRegistry.getInstrumentation().getContext().getContentResolver()
                .call(Uri.parse("content://" + BackupDocumentsProvider.AUTHORITY), "reset", null, null);
            AutoExportPlugin.wipe(app);
            encrypted.delete();
        }
    }

    @Test public void activityDestructionDoesNotWaitForNativeDelivery() throws Exception {
        prepareNativeStage(false);
        ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class);
        java.util.concurrent.atomic.AtomicReference<Exception> failure = new java.util.concurrent.atomic.AtomicReference<>();
        Thread delivery = new Thread(() -> {
            synchronized (BackupWork.OWNER) {
                try { PersistentBackup.deliver(app); }
                catch (Exception error) { failure.set(error); }
            }
        });
        try {
            resolver.call(Uri.parse("content://" + BackupDocumentsProvider.AUTHORITY), "fault", "blocked", null);
            delivery.start();
            long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
            boolean blocked = false;
            while (System.nanoTime() < deadline) {
                blocked = resolver.call(Uri.parse("content://" + BackupDocumentsProvider.AUTHORITY), "blocked", null, null).getBoolean("blocked");
                if (blocked) break;
                Thread.sleep(50);
            }
            assertTrue("SAF delivery never reached the blocked provider", blocked);
            long started = System.nanoTime();
            scenario.close();
            assertTrue("activity destruction waited for native delivery", System.nanoTime() - started < TimeUnit.SECONDS.toNanos(2));
            assertTrue("delivery must still own its blocked copy", delivery.isAlive());
            delivery.join(15000);
            assertFalse(delivery.isAlive());
            assertNotNull(failure.get());
        } finally {
            resolver.call(Uri.parse("content://" + BackupDocumentsProvider.AUTHORITY), "fault", "none", null);
            delivery.join(15000);
            scenario.close();
        }
    }

    @Test public void nativeFailuresStopAfterThreeAttemptsUntilNextDay() throws Exception {
        prepareNativeStage(false);
        SharedPreferences preferences = BackupWork.preferences(app);
        synchronized (BackupWork.OWNER) {
            JSONObject stage = new JSONObject(preferences.getString("encryptedStage", "{}"));
            preferences.edit().putLong("lastSuccessAt", 17).commit();
            preferences.edit().putString("encryptedStage", stage.put("due", BackupWork.due(preferences)).toString()).commit();
            resolver.call(Uri.parse("content://" + BackupDocumentsProvider.AUTHORITY), "fault", "full", null);
            BackupWork.schedule(app);
        }
        try {
            long started = System.currentTimeMillis();
            long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(160);
            while (!preferences.contains("retryNotBeforeAt") && System.nanoTime() < deadline) Thread.sleep(100);
            assertTrue("native retries never reached their daily pause", preferences.contains("retryNotBeforeAt"));
            assertTrue(preferences.getLong("retryNotBeforeAt", 0) >= started + BackupWork.DAY);
            assertEquals(17, preferences.getLong("lastSuccessAt", 0));
            assertTrue(preferences.contains("encryptedStage"));
            java.util.List<androidx.work.WorkInfo> jobs = WorkManager.getInstance(app)
                .getWorkInfosForUniqueWork(BackupWork.NAME).get(10, TimeUnit.SECONDS);
            assertTrue("three real attempts were not observed", jobs.stream().anyMatch(info -> info.getRunAttemptCount() >= 2));
            assertTrue("daily successor missing", jobs.stream().anyMatch(info -> !info.getState().isFinished() && info.getRunAttemptCount() == 0));
            long failedAt = preferences.getLong("lastFailureAt", 0);
            Thread.sleep(2000);
            assertEquals("delivery retried during the daily pause", failedAt, preferences.getLong("lastFailureAt", 0));
            System.out.println("Native retry evidence: completed attempts=3, next delivery at=" + preferences.getLong("retryNotBeforeAt", 0));
        } finally { resolver.call(Uri.parse("content://" + BackupDocumentsProvider.AUTHORITY), "fault", "none", null); }
    }

    @Test public void mountedScreenRefreshesNativeDeliveryInBothLocales() throws Exception {
        prepareNativeStage(false);
        java.nio.file.Files.copy(app.getDatabasePath("native-backup-protected.sqlite3").toPath(),
            app.getDatabasePath("engender.sqlite3").toPath(), java.nio.file.StandardCopyOption.REPLACE_EXISTING);
        File publicPhotos = new File(app.getFilesDir(), "photos");
        publicPhotos.mkdirs();
        File[] protectedPhotos = new File(app.getFilesDir(), "encryption-probe-photos").listFiles();
        if (protectedPhotos != null) for (File photo : protectedPhotos) {
            if (photo.isFile()) java.nio.file.Files.copy(photo.toPath(), new File(publicPhotos, photo.getName()).toPath(),
                java.nio.file.StandardCopyOption.REPLACE_EXISTING);
        }
        SharedPreferences preferences = BackupWork.preferences(app);
        long before = preferences.getLong("lastSuccessAt", 0);
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            WebViewProbe page = new WebViewProbe(scenario, 120);
            page.evaluate("location.href='/settings/export'");
            page.awaitTrue("!!document.querySelector('#journal-passphrase')");
            assertEquals("false", page.evaluate("!!document.querySelector('[data-auto-backup-status]')"));
            unlockRenderedPage(page);
            page.awaitTrue("!!document.querySelector('[data-auto-backup-status]')");
            String staged = page.evaluate("document.querySelector('[data-auto-backup-status]').textContent");
            assertTrue(staged.contains("Delivery is pending"));
            scenario.moveToState(androidx.lifecycle.Lifecycle.State.CREATED);
            long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(120);
            while (preferences.getLong("lastSuccessAt", 0) == before && System.nanoTime() < deadline) Thread.sleep(100);
            assertTrue("native delivery never changed the mounted screen's underlying status", preferences.getLong("lastSuccessAt", 0) > before);
            scenario.moveToState(androidx.lifecycle.Lifecycle.State.RESUMED);
            page.awaitTrue("!!document.querySelector('[data-auto-backup-status]') && !document.querySelector('[data-auto-backup-status]').textContent.includes('Delivery is pending')");
            assertTrue(page.evaluate("document.querySelector('[data-auto-backup-status]').textContent").contains("Journal captured"));
            System.out.println("English native screen outcome: " + page.evaluate("document.querySelector('[data-auto-backup-status]').textContent"));
            page.evaluate("localStorage.setItem('PARAGLIDE_LOCALE','pl');location.reload()");
            page.awaitTrue("!!document.querySelector('#journal-passphrase')");
            assertEquals("false", page.evaluate("!!document.querySelector('[data-auto-backup-status]')"));
            assertEquals("false", page.evaluate("document.body.textContent.includes('Before cold deferral') || document.body.textContent.includes('After authenticated unlock')"));
            unlockRenderedPage(page);
            page.awaitTrue("!!document.querySelector('[data-auto-backup-status]')");
            String polish = page.evaluate("document.querySelector('[data-auto-backup-status]').textContent");
            assertTrue(polish.contains("Stan dziennika"));
            preferences.edit().putLong("lastFailureAt", System.currentTimeMillis()).putString("lastFailureReason", "destination-unavailable").commit();
            scenario.moveToState(androidx.lifecycle.Lifecycle.State.CREATED);
            scenario.moveToState(androidx.lifecycle.Lifecycle.State.RESUMED);
            page.awaitTrue("document.querySelector('[data-auto-backup-status]').textContent.includes('Nie udało się zapisać zaszyfrowanej kopii')");
            preferences.edit().putLong("deferredAt", System.currentTimeMillis()).remove("lastFailureAt").remove("lastFailureReason").commit();
            scenario.moveToState(androidx.lifecycle.Lifecycle.State.CREATED);
            scenario.moveToState(androidx.lifecycle.Lifecycle.State.RESUMED);
            page.awaitTrue("document.querySelector('[data-auto-backup-status]').textContent.includes('odblokowanie')");
            System.out.println("Polish native screen outcome: " + page.evaluate("document.querySelector('[data-auto-backup-status]').textContent"));
        }
    }

    private void unlockRenderedPage(WebViewProbe page) throws Exception {
        page.evaluate("(() => {const input=document.querySelector('#journal-passphrase');input.value='synthetic current journal credential';input.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('[data-passphrase-submit]').click();})()");
    }

    private String journalFileHash() throws Exception {
        byte[] bytes = java.nio.file.Files.readAllBytes(app.getDatabasePath("native-backup-protected.sqlite3").toPath());
        return android.util.Base64.encodeToString(java.security.MessageDigest.getInstance("SHA-256").digest(bytes), android.util.Base64.NO_WRAP);
    }

    private void grantDestination() throws Exception {
        java.util.concurrent.CountDownLatch ready = new java.util.concurrent.CountDownLatch(1);
        app.sendOrderedBroadcast(new Intent().setComponent(new android.content.ComponentName(
            InstrumentationRegistry.getInstrumentation().getContext().getPackageName(), BackupDocumentsProvider.Bootstrap.class.getName()))
            .putExtra("targetPackage", app.getPackageName()).putExtra("reset", false), null, new android.content.BroadcastReceiver() {
                @Override public void onReceive(Context context, Intent intent) { ready.countDown(); }
            }, null, 0, null, null);
        assertTrue(ready.await(10, TimeUnit.SECONDS));
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

            grantDestination();
            synchronized (BackupWork.OWNER) {
                PersistentBackup.clear(app);
                preferences.edit().clear().putBoolean("enabled", true).putString("schedule", "weekly")
                    .putString("destinationUri", tree.toString()).commit();
            }
            if (deferred) {
                if (android.os.Build.VERSION.SDK_INT >= 28) {
                copyAssets("auto-export-probe", bundle);
                try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
                    scenario.onActivity(activity -> activity.getBridge().setServerBasePath(bundle.getAbsolutePath()));
                    WebViewProbe probe = new WebViewProbe(scenario, 120);
                    probe.awaitTrue("window.backupProbe && window.backupProbe.ready");
                    JSONObject protectedSetup = command(probe, "prepareProtected()");
                    assertTrue(protectedSetup.toString(), protectedSetup.optBoolean("protectedClosed"));
                }
                }
                long last = System.currentTimeMillis() - 7 * BackupWork.DAY + 45000;
                preferences.edit().putLong("lastSuccessAt", last).putLong("proofPreviousSuccess", last).commit();
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
