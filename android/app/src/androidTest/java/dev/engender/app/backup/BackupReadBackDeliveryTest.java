package dev.engender.app.backup;

import static org.junit.Assert.*;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import androidx.test.core.app.ActivityScenario;
import androidx.test.platform.app.InstrumentationRegistry;
import dev.engender.app.MainActivity;
import dev.engender.app.webview.WebViewProbe;
import java.io.File;
import java.io.FileInputStream;
import java.util.concurrent.TimeUnit;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

/**
 * FA 56 on the real delivery path: an archive sealed under a password other
 * than the saved backup password is written to the folder, fails the
 * read-back, is deleted, and never joins the verified list retention counts.
 * Before FA 56 the read-back compared bytes only, so this delivery
 * succeeded and the file was listed as verified.
 */
public class BackupReadBackDeliveryTest extends BackupDeliveryTestSupport {
    @Test public void aBackupThatDoesNotOpenWithTheSavedPasswordIsNeitherListedNorCounted() throws Exception {
        java.util.concurrent.CountDownLatch granted = new java.util.concurrent.CountDownLatch(1);
        app.sendOrderedBroadcast(new Intent().setComponent(new android.content.ComponentName(
            InstrumentationRegistry.getInstrumentation().getContext().getPackageName(), BackupDocumentsProvider.Bootstrap.class.getName()))
            .putExtra("targetPackage", app.getPackageName()), null, new android.content.BroadcastReceiver() {
                @Override public void onReceive(Context context, Intent intent) { granted.countDown(); }
            }, null, 0, null, null);
        assertTrue(granted.await(10, TimeUnit.SECONDS));
        SharedPreferences prefs = BackupWork.preferences(app);
        prefs.edit().clear().putBoolean("enabled", true).putString("schedule", "weekly")
            .putString("destinationUri", tree.toString()).commit();
        File bundle = new File(app.getFilesDir(), "auto-export-probe");
        copyAssets("auto-export-probe", bundle);
        File encrypted = new File(app.getCacheDir(), "read-back-fixture.ttbackup");
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            scenario.onActivity(activity -> activity.getBridge().setServerBasePath(bundle.getAbsolutePath()));
            WebViewProbe probe = new WebViewProbe(scenario, 120);
            probe.awaitTrue("window.backupProbe && window.backupProbe.ready");
            JSONObject baseline = command(probe, "run(2)");
            assertEquals(baseline.toString(), "ok", baseline.getJSONObject("result").getString("outcome"));
            Uri good = documents().get(0);
            copyDocument(good, encrypted);
            StringBuilder hex = new StringBuilder();
            for (byte value : hash(good)) hex.append(String.format(java.util.Locale.ROOT, "%02x", value & 0xff));
            String digest = hex.toString();
            assertEquals(1, new JSONArray(prefs.getString("verifiedBackups", "[]")).length());

            // The saved password moves on; the archive on hand was sealed under the old one.
            JSONObject changed = probe.awaitCall(probe.startCall("AutoExport", "setPassword",
                new JSONObject().put("password", "a different backup password")));
            assertEquals(changed.toString(), "resolved", changed.getString("state"));

            synchronized (BackupWork.OWNER) {
                prefs.edit().putLong("lastSuccessAt", 17).commit();
                try (StagedBackup staged = new StagedBackup(new File(app.getCacheDir(), "read-back-fixture.pending"));
                     FileInputStream input = new FileInputStream(encrypted)) {
                    byte[] buffer = new byte[8192]; long offset = 0; int count;
                    while ((count = input.read(buffer)) != -1) {
                        staged.append(offset, java.util.Arrays.copyOf(buffer, count)); offset += count;
                    }
                    staged.prepare(offset, digest);
                    PersistentBackup.stage(app, staged, offset, digest, System.currentTimeMillis(), prefs.getLong("backupGeneration", 0));
                }
                try {
                    PersistentBackup.deliver(app);
                    fail("a backup sealed under another password was delivered as verified");
                } catch (IllegalStateException refused) {
                    assertEquals("backup-unreadable", refused.getMessage());
                }
            }
            assertEquals(17, prefs.getLong("lastSuccessAt", 0));
            assertEquals(1, new JSONArray(prefs.getString("verifiedBackups", "[]")).length());
            assertEquals(java.util.Collections.singletonList(good), documents());
        } finally {
            AutoExportPlugin.wipe(app); encrypted.delete();
            resolver.call(Uri.parse("content://" + BackupDocumentsProvider.AUTHORITY), "reset", null, null);
        }
    }
}
