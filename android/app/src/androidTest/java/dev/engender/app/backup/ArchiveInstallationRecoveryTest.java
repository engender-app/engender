package dev.engender.app.backup;

import static org.junit.Assert.*;
import android.content.Context;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.DocumentsContract;
import android.util.Base64;
import androidx.test.core.app.ActivityScenario;
import androidx.test.platform.app.InstrumentationRegistry;
import dev.engender.app.MainActivity;
import dev.engender.app.webview.WebViewProbe;
import java.io.File;
import java.nio.file.Files;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import org.json.JSONObject;
import org.junit.Test;

/** Host runner destroys the source sandbox between these required phases. */
public class ArchiveInstallationRecoveryTest extends AutoExportDeliveryTest {
    @Test public void recoveryPhase() throws Exception {
        String phase = InstrumentationRegistry.getArguments().getString("recoveryPhase");
        assertNotNull("the maintained runner must supply a recovery phase", phase);
        assertTrue(phase.equals("source") || phase.equals("automatic") || phase.equals("restore"));
        File bundle = new File(app.getFilesDir(), "archive-recovery-probe");
        copyAssets("archive-recovery-probe", bundle);
        File input = new File(app.getFilesDir(), "recovery-input.json");
        if (phase.equals("restore")) {
            assertTrue("password-only Archive input is missing", input.isFile());
            BackupWork.preferences(app).edit().putString("destinationUri", "content://destination-local-marker")
                .putString("schedule", "monthly").putBoolean("enabled", false).commit();
        }
        if (phase.equals("automatic")) {
            CountDownLatch granted = new CountDownLatch(1);
            app.sendOrderedBroadcast(new Intent().setComponent(new android.content.ComponentName(
                InstrumentationRegistry.getInstrumentation().getContext().getPackageName(), BackupDocumentsProvider.Bootstrap.class.getName()))
                .putExtra("targetPackage", app.getPackageName()), null, new android.content.BroadcastReceiver() {
                    @Override public void onReceive(Context context, Intent intent) { granted.countDown(); }
                }, null, 0, null, null);
            assertTrue(granted.await(10, TimeUnit.SECONDS));
            BackupWork.preferences(app).edit().clear().putBoolean("enabled", true).putString("schedule", "weekly")
                .putString("destinationUri", tree.toString()).putLong("lastSuccessAt", System.currentTimeMillis() - 7 * BackupWork.DAY + 15000).commit();
        }
        JSONObject result;
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            scenario.onActivity(activity -> activity.getBridge().setServerBasePath(bundle.getAbsolutePath()));
            WebViewProbe probe = new WebViewProbe(scenario, 240);
            probe.awaitTrue("window.recoveryProbe && window.recoveryProbe.ready");
            String payload = phase.equals("restore") ? new String(Files.readAllBytes(input.toPath()), java.nio.charset.StandardCharsets.UTF_8) : "null";
            probe.evaluate("window.recoveryProbe.command(" + JSONObject.quote(phase) + "," + payload + ")");
            probe.awaitTrue("window.recoveryProbe.ready");
            result = new JSONObject(new org.json.JSONTokener(probe.evaluate("JSON.stringify(window.recoveryProbe.result)")).nextValue().toString());
            assertFalse(result.toString(), result.has("error"));
            assertTrue(result.toString(), result.has("identity"));
        }
        if (phase.equals("automatic")) {
            // No foreground page remains while WorkManager delivers the verified stage.
            long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(180);
            while (!BackupWork.preferences(app).contains("lastSnapshotAt") && System.nanoTime() < deadline) Thread.sleep(100);
            assertTrue("automatic stage was not delivered", BackupWork.preferences(app).contains("lastSnapshotAt"));
            assertFalse(BackupWork.preferences(app).contains("encryptedStage"));
            Uri children = DocumentsContract.buildChildDocumentsUriUsingTree(tree, "root");
            try (Cursor cursor = resolver.query(children, new String[] { DocumentsContract.Document.COLUMN_DOCUMENT_ID }, null, null, null)) {
                assertNotNull(cursor);
                assertEquals("exactly one verified automatic Archive", 1, cursor.getCount());
                assertTrue(cursor.moveToFirst());
                Uri archive = DocumentsContract.buildDocumentUriUsingTree(tree, cursor.getString(0));
                try (java.io.InputStream stream = resolver.openInputStream(archive)) {
                    assertNotNull(stream);
                    java.io.ByteArrayOutputStream archiveBytes = new java.io.ByteArrayOutputStream();
                    byte[] buffer = new byte[65536];
                    for (int count; (count = stream.read(buffer)) != -1;) archiveBytes.write(buffer, 0, count);
                    result.put("archive", Base64.encodeToString(archiveBytes.toByteArray(), Base64.NO_WRAP));
                }
            }
            result.put("nativeDeliveredWithoutPage", true);
        }
        Files.write(new File(app.getFilesDir(), "recovery-output.json").toPath(), result.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8));
    }
}
