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
import java.io.FileInputStream;
import java.util.concurrent.TimeUnit;
import org.json.JSONObject;
import org.junit.Test;

/** Both production delivery owners must refuse a weaker provider boundary. */
public class BackupDeliveryDurabilityTest extends BackupDeliveryTestSupport {
    @Test public void failedForegroundAndWorkerDeliveriesPreserveLastGood() throws Exception {
        java.util.concurrent.CountDownLatch granted = new java.util.concurrent.CountDownLatch(1);
        app.sendOrderedBroadcast(new Intent().setComponent(new android.content.ComponentName(
            InstrumentationRegistry.getInstrumentation().getContext().getPackageName(), BackupDocumentsProvider.Bootstrap.class.getName()))
            .putExtra("targetPackage", app.getPackageName()), null, new android.content.BroadcastReceiver() {
                @Override public void onReceive(Context context, Intent intent) { granted.countDown(); }
            }, null, 0, null, null);
        assertTrue(granted.await(10, TimeUnit.SECONDS));
        SharedPreferences prefs = BackupWork.preferences(app);
        prefs.edit().clear().putBoolean("enabled", true).putString("destinationUri", tree.toString()).commit();
        File bundle = new File(app.getFilesDir(), "auto-export-probe");
        copyAssets("auto-export-probe", bundle);
        File encrypted = new File(app.getCacheDir(), "durability-fixture.ttbackup");
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            scenario.onActivity(activity -> activity.getBridge().setServerBasePath(bundle.getAbsolutePath()));
            WebViewProbe probe = new WebViewProbe(scenario, 120);
            probe.awaitTrue("window.backupProbe && window.backupProbe.ready");
            JSONObject baseline = command(probe, "run(2)");
            assertEquals(baseline.toString(), "ok", baseline.getJSONObject("result").getString("outcome"));
            Uri good = documents().get(0);
            byte[] goodHash = hash(good);
            copyDocument(good, encrypted);
            StringBuilder hexadecimal = new StringBuilder();
            for (byte value : goodHash) hexadecimal.append(String.format(java.util.Locale.ROOT, "%02x", value & 0xff));
            String digest = hexadecimal.toString();
            for (String fault : new String[] { "full", "truncated", "pipe", "cloud-cache" }) {
                resolver.call(Uri.parse("content://" + BackupDocumentsProvider.AUTHORITY), "fault", fault, null);
                if ("cloud-cache".equals(fault)) {
                    try (android.os.ParcelFileDescriptor cached = resolver.openFileDescriptor(good, "rw")) {
                        assertTrue(android.system.OsConstants.S_ISREG(android.system.Os.fstat(cached.getFileDescriptor()).st_mode));
                        cached.getFileDescriptor().sync();
                    }
                }
                long success = prefs.getLong("lastSuccessAt", 0);
                JSONObject failed = command(probe, "run(2)");
                assertEquals(failed.toString(), "failed", failed.getJSONObject("result").getString("outcome"));
                assertTrue(failed.toString(), failed.isNull("recorded"));
                assertEquals(success, prefs.getLong("lastSuccessAt", 0));
                assertEquals(java.util.Collections.singletonList(good), documents());

                synchronized (BackupWork.OWNER) {
                    prefs.edit().putLong("lastSuccessAt", 17).remove("lastFailureAt").commit();
                    try (StagedBackup staged = new StagedBackup(new File(app.getCacheDir(), "durability-fixture.pending"));
                         FileInputStream input = new FileInputStream(encrypted)) {
                        byte[] buffer = new byte[8192]; long offset = 0; int count;
                        while ((count = input.read(buffer)) != -1) {
                            staged.append(offset, java.util.Arrays.copyOf(buffer, count)); offset += count;
                        }
                        staged.prepare(offset, digest);
                        PersistentBackup.stage(app, staged, offset, digest, System.currentTimeMillis(), prefs.getLong("backupGeneration", 0));
                    }
                    BackupWork.schedule(app);
                }
                long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(20);
                while (!prefs.contains("lastFailureAt") && System.nanoTime() < deadline) Thread.sleep(50);
                assertTrue("actual BackupWork did not reject " + fault, prefs.contains("lastFailureAt"));
                if ("cloud-cache".equals(fault) || "pipe".equals(fault)) {
                    assertEquals("destination-durability-unavailable", prefs.getString("lastFailureReason", null));
                }
                assertEquals(17, prefs.getLong("lastSuccessAt", 0));
                assertEquals(java.util.Collections.singletonList(good), documents());
                assertEquals(1, new org.json.JSONArray(prefs.getString("verifiedBackups", "[]")).length());
                BackupWork.await(WorkManager.getInstance(app).cancelUniqueWork(BackupWork.NAME));
                synchronized (BackupWork.OWNER) { PersistentBackup.clear(app); }
                resolver.call(Uri.parse("content://" + BackupDocumentsProvider.AUTHORITY), "fault", "none", null);
                assertArrayEquals(goodHash, hash(good));
            }
        } finally {
            resolver.call(Uri.parse("content://" + BackupDocumentsProvider.AUTHORITY), "fault", "none", null);
            AutoExportPlugin.wipe(app); encrypted.delete();
            resolver.call(Uri.parse("content://" + BackupDocumentsProvider.AUTHORITY), "reset", null, null);
        }
    }
}
