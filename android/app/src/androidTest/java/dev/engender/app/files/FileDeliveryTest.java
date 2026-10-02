package dev.engender.app.files;

import static org.junit.Assert.*;
import android.app.Activity;
import android.app.Instrumentation;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.net.Uri;
import android.provider.DocumentsContract;
import android.util.Base64;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;
import dev.engender.app.MainActivity;
import dev.engender.app.backup.BackupDocumentsProvider;
import java.io.File;
import java.io.InputStream;
import java.security.MessageDigest;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class FileDeliveryTest {
    private final Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();
    private final Context app = instrumentation.getTargetContext();
    private final Uri tree = DocumentsContract.buildTreeDocumentUri(BackupDocumentsProvider.AUTHORITY, "root");

    @Test public void processDeathProbeLeavesOnlyEncryptedStaging() throws Exception {
        byte[] body = "private-journal-export-sentinel".getBytes(java.nio.charset.StandardCharsets.UTF_8);
        ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class);
        scenario.onActivity(activity -> {
            FileDeliveryPlugin plugin = (FileDeliveryPlugin) activity.getBridge().getPlugin("FileDelivery").getInstance();
            CapturedCall begin = new CapturedCall("beginFile", new JSObject().put("fileName", "proof.csv").put("type", "text/csv"));
            plugin.beginFile(begin);
            assertNull(begin.error);
            CapturedCall append = new CapturedCall("appendFile", new JSObject().put("transferId", begin.result.getString("transferId"))
                .put("offset", 0).put("base64", Base64.encodeToString(body, Base64.NO_WRAP)));
            plugin.appendFile(append);
            assertNull(append.error);
        });
        byte[] stored = java.nio.file.Files.readAllBytes(new File(app.getCacheDir(), "manual-export.pending").toPath());
        assertFalse(new String(stored, java.nio.charset.StandardCharsets.ISO_8859_1).contains("private-journal-export-sentinel"));
        // Leave transfer live so the host can kill the process and inspect its cache.
    }

    @Test public void restartAndResetRemoveOrphanStaging() throws Exception {
        File file = new File(app.getCacheDir(), "manual-export.pending");
        try (java.io.FileOutputStream output = new java.io.FileOutputStream(file)) { output.write(37); }
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            scenario.onActivity(activity -> activity.getBridge().getPlugin("FileDelivery").getInstance());
            assertFalse(file.exists());
        }
        try (java.io.FileOutputStream output = new java.io.FileOutputStream(file)) { output.write(37); }
        dev.engender.app.reset.DeviceStores.wipe(app);
        assertFalse(file.exists());
    }

    @Test public void savePickerDeliversVerifiedBytesAndCancellationAndTruncationNeverSucceed() throws Exception {
        CountDownLatch bootstrapped = new CountDownLatch(1);
        app.sendOrderedBroadcast(new Intent().setComponent(new android.content.ComponentName(
            "dev.engender.app.test", BackupDocumentsProvider.Bootstrap.class.getName())), null,
            new android.content.BroadcastReceiver() {
                @Override public void onReceive(Context context, Intent intent) { bootstrapped.countDown(); }
            }, null, 0, null, null);
        assertTrue(bootstrapped.await(10, TimeUnit.SECONDS));
        byte[] body = new byte[1024 * 1024 + 37];
        java.util.Arrays.fill(body, (byte) 65);
        StringBuilder digest = new StringBuilder();
        for (byte value : MessageDigest.getInstance("SHA-256").digest(body)) digest.append(String.format("%02x", value & 255));
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            for (String outcome : new String[] {"saved", "cancelled", "truncated", "destroyed"}) {
                Uri destination = DocumentsContract.createDocument(app.getContentResolver(),
                    DocumentsContract.buildDocumentUriUsingTree(tree, "root"), "text/plain", outcome + ".txt");
                assertNotNull(destination);
                app.getContentResolver().call(Uri.parse("content://" + BackupDocumentsProvider.AUTHORITY),
                    "fault", outcome.equals("destroyed") ? "blocked" : outcome.equals("truncated") ? "truncated" : "none", null);
                IntentFilter filter = new IntentFilter(Intent.ACTION_CREATE_DOCUMENT);
                filter.addCategory(Intent.CATEGORY_OPENABLE);
                filter.addDataType("text/plain");
                Instrumentation.ActivityMonitor monitor = instrumentation.addMonitor(filter,
                    new Instrumentation.ActivityResult(outcome.equals("cancelled") ? Activity.RESULT_CANCELED : Activity.RESULT_OK,
                        new Intent().setData(destination)), true);
                CapturedCall finish = new CapturedCall("finishFile", new JSObject());
                try {
                    scenario.onActivity(activity -> {
                        FileDeliveryPlugin plugin = (FileDeliveryPlugin) activity.getBridge().getPlugin("FileDelivery").getInstance();
                        CapturedCall begin = new CapturedCall("beginFile", new JSObject().put("fileName", "proof.txt").put("type", "text/plain"));
                        plugin.beginFile(begin);
                        assertNull(begin.error);
                        String id = begin.result.getString("transferId");
                        for (int at = 0; at < body.length; at += 65536) {
                            byte[] piece = java.util.Arrays.copyOfRange(body, at, Math.min(at + 65536, body.length));
                            CapturedCall append = new CapturedCall("appendFile", new JSObject().put("transferId", id)
                                .put("offset", at).put("base64", Base64.encodeToString(piece, Base64.NO_WRAP)));
                            plugin.appendFile(append);
                            assertNull(append.error);
                        }
                        finish.getData().put("transferId", id).put("byteLength", body.length).put("sha256", digest.toString());
                        plugin.finishFile(finish);
                    });
                    if (outcome.equals("destroyed")) {
                        Uri provider = Uri.parse("content://" + BackupDocumentsProvider.AUTHORITY);
                        long deadline = android.os.SystemClock.elapsedRealtime() + 5000;
                        while (!app.getContentResolver().call(provider, "blocked", null, null).getBoolean("blocked")
                            && android.os.SystemClock.elapsedRealtime() < deadline) Thread.sleep(20);
                        assertTrue(app.getContentResolver().call(provider, "blocked", null, null).getBoolean("blocked"));
                        long before = android.os.SystemClock.elapsedRealtime();
                        scenario.close();
                        long closingMs = android.os.SystemClock.elapsedRealtime() - before;
                        app.getContentResolver().call(provider, "release", null, null);
                        assertTrue("destruction waited for provider I/O: " + closingMs + "ms", closingMs < 1500);
                    }
                    assertTrue("save result never arrived", finish.done.await(20, TimeUnit.SECONDS));
                    assertEquals("native save picker must be launched", 1, monitor.getHits());
                    if (outcome.equals("saved")) {
                        assertNull(finish.error);
                        assertEquals(Boolean.TRUE, finish.result.getBool("saved"));
                        try (InputStream input = app.getContentResolver().openInputStream(destination)) {
                            StagedFile.verify(input, body.length, digest.toString());
                        }
                    } else if (outcome.equals("cancelled")) {
                        assertNull(finish.error);
                        assertEquals(Boolean.FALSE, finish.result.getBool("saved"));
                    } else {
                        assertEquals("export-delivery-failed", finish.error);
                    }
                    assertFalse(new File(app.getCacheDir(), "manual-export.pending").exists());
                } finally { instrumentation.removeMonitor(monitor); }
            }
        } finally {
            app.getContentResolver().call(Uri.parse("content://" + BackupDocumentsProvider.AUTHORITY), "reset", null, null);
        }
    }

    private static final class CapturedCall extends PluginCall {
        final CountDownLatch done = new CountDownLatch(1);
        JSObject result;
        String error;
        CapturedCall(String method, JSObject data) { super(null, "FileDelivery", UUID.randomUUID().toString(), method, data); }
        @Override public void resolve(JSObject value) { result = value; done.countDown(); }
        @Override public void resolve() { result = new JSObject(); done.countDown(); }
        @Override public void reject(String message, String code, Exception exception, JSObject data) { error = message; done.countDown(); }
    }
}
