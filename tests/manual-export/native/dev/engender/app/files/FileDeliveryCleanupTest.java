package dev.engender.app.files;

import static org.junit.Assert.*;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.database.Cursor;
import android.net.Uri;
import android.provider.DocumentsContract;
import androidx.test.core.app.ActivityScenario;
import androidx.test.platform.app.InstrumentationRegistry;
import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;
import dev.engender.app.MainActivity;
import dev.engender.app.backup.BackupDocumentsProvider;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import org.junit.Test;

/** Opt-in provider tests. The interruption method needs the companion host runner. */
public class FileDeliveryCleanupTest {
    private final Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();
    private final Context app = instrumentation.getTargetContext();
    private final Uri provider = Uri.parse("content://" + BackupDocumentsProvider.AUTHORITY);
    private final Uri tree = DocumentsContract.buildTreeDocumentUri(BackupDocumentsProvider.AUTHORITY, "root");

    @Test public void cancellationAndFailedWritesDeleteOnlyTheirOwnDestination() throws Exception {
        bootstrap(true);
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            CapturedCall status = new CapturedCall("recoveryStatus", new JSObject());
            scenario.onActivity(activity -> ((FileDeliveryPlugin) activity.getBridge().getPlugin("FileDelivery").getInstance())
                .recoveryStatus(status));
            assertNull(status.error);
            assertNotNull(status.result.getString("processId"));
            assertTrue(status.result.has("resetEpoch"));
            Uri unrelated = create("keep.txt");
            try (java.io.OutputStream output = app.getContentResolver().openOutputStream(unrelated)) { output.write(42); }
            for (String fault : new String[] {"none", "cancelled", "truncated", "full"}) {
                Uri target = create(fault + ".txt");
                fault(fault.equals("cancelled") ? "none" : fault);
                CapturedCall finish = transfer(scenario, target, fault.equals("cancelled"), new byte[65537]);
                assertTrue("save result never arrived", finish.done.await(20, TimeUnit.SECONDS));
                if (fault.equals("none")) {
                    assertNull(finish.error);
                    assertTrue(finish.result.getBoolean("saved", false));
                    assertTrue(exists(target));
                    DocumentsContract.deleteDocument(app.getContentResolver(), target);
                } else {
                    if (fault.equals("cancelled")) {
                        assertNull(finish.error);
                        assertFalse(finish.result.getBoolean("saved", true));
                    } else {
                        assertEquals("export-delivery-failed", finish.error);
                        assertEquals(fault.equals("full") ? "destination-full" : null, finish.code);
                        assertNotNull("failure lost its transfer identity", finish.errorData);
                        assertEquals(finish.getData().getString("transferId"), finish.errorData.getString("transferId"));
                        assertEquals(status.result.getString("processId"), finish.errorData.getString("processId"));
                        assertEquals(status.result.getLong("resetEpoch"), finish.errorData.getLong("resetEpoch"));
                    }
                    assertFalse("failed/cancelled target remains", exists(target));
                }
                assertTrue("unrelated file was removed", exists(unrelated));
                assertFalse(ManualExportCleanup.pending(app));
                assertEquals(0, pendingFiles());
            }
            fault("none");
            try (java.io.InputStream input = app.getContentResolver().openInputStream(unrelated)) { assertEquals(42, input.read()); }
        } finally { bootstrap(true); }
    }

    @Test public void deniedCleanupRemainsRecordedUntilAccessReturns() throws Exception {
        bootstrap(true);
        Uri unrelated = create("keep.txt");
        Uri target = create("unfinished.txt");
        String id = UUID.randomUUID().toString();
        ManualExportCleanup.destination(app, id, target);
        app.getContentResolver().call(provider, "revoke", null, null);
        assertFalse("revoked destination unexpectedly deleted", ManualExportCleanup.failed(app, id, target));
        assertTrue(ManualExportCleanup.pending(app));
        ManualExportCleanup.recover(app);
        assertTrue(ManualExportCleanup.pending(app));
        assertTrue(ManualExportCleanup.consumeInterrupted(app));
        bootstrap(false);
        assertTrue(exists(target));
        ManualExportCleanup.recover(app);
        assertFalse(exists(target));
        assertTrue(exists(unrelated));
        assertFalse(ManualExportCleanup.pending(app));
        bootstrap(true);
    }

    @Test public void prepareInterruptedWriteForHost() throws Exception {
        bootstrap(true);
        ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class);
        Uri unrelated = create("keep.txt");
        Uri target = create("interrupted.txt");
        app.getSharedPreferences("manual-export-probe", 0).edit()
            .putString("target", target.toString()).putString("unrelated", unrelated.toString()).commit();
        fault("interrupted-write");
        CapturedCall finish = transfer(scenario, target, false, new byte[1024 * 1024 + 37]);
        // The host waits for the provider's partial-write marker, then kills this process.
        assertFalse("host did not interrupt the active writer", finish.done.await(120, TimeUnit.SECONDS));
    }

    @Test public void restartRemovesInterruptedTargetAndKeepsUnrelatedFile() throws Exception {
        assertIsolated();
        bootstrap(false);
        fault("none");
        Uri target = Uri.parse(app.getSharedPreferences("manual-export-probe", 0).getString("target", ""));
        Uri unrelated = Uri.parse(app.getSharedPreferences("manual-export-probe", 0).getString("unrelated", ""));
        assertTrue("host did not leave a partial destination", exists(target));
        assertTrue(ManualExportCleanup.pending(app));
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            CountDownLatch ready = new CountDownLatch(1);
            scenario.onActivity(activity -> activity.getBridge().execute(ready::countDown));
            assertTrue(ready.await(15, TimeUnit.SECONDS));
            assertFalse("restart did not remove the owned target", exists(target));
            assertTrue("restart removed an unrelated file", exists(unrelated));
            assertFalse(ManualExportCleanup.pending(app));
            assertTrue(ManualExportCleanup.consumeInterrupted(app));
            assertEquals(0, pendingFiles());
        } finally { bootstrap(true); app.getSharedPreferences("manual-export-probe", 0).edit().clear().commit(); }
    }

    private CapturedCall transfer(ActivityScenario<MainActivity> scenario, Uri target, boolean cancelled, byte[] body) throws Exception {
        IntentFilter filter = new IntentFilter(Intent.ACTION_CREATE_DOCUMENT);
        filter.addCategory(Intent.CATEGORY_OPENABLE);
        filter.addDataType("text/plain");
        Instrumentation.ActivityMonitor monitor = instrumentation.addMonitor(filter,
            new Instrumentation.ActivityResult(cancelled ? Activity.RESULT_CANCELED : Activity.RESULT_OK,
                new Intent().setData(target)), true);
        CapturedCall finish = new CapturedCall("finishFile", new JSObject());
        try {
            scenario.onActivity(activity -> {
                FileDeliveryPlugin plugin = (FileDeliveryPlugin) activity.getBridge().getPlugin("FileDelivery").getInstance();
                CapturedCall begin = new CapturedCall("beginFile", new JSObject().put("fileName", "probe.txt").put("type", "text/plain"));
                plugin.beginFile(begin);
                assertNull(begin.error);
                String id = begin.result.getString("transferId");
                for (int offset = 0; offset < body.length; offset += 65536) {
                    byte[] piece = java.util.Arrays.copyOfRange(body, offset, Math.min(offset + 65536, body.length));
                    CapturedCall append = new CapturedCall("appendFile", new JSObject().put("transferId", id).put("offset", offset)
                        .put("base64", android.util.Base64.encodeToString(piece, android.util.Base64.NO_WRAP)));
                    plugin.appendFile(append);
                    assertNull(append.error);
                }
                finish.getData().put("transferId", id).put("byteLength", body.length).put("sha256", hash(body));
                plugin.finishFile(finish);
            });
            assertEquals(1, monitor.getHits());
        } finally { instrumentation.removeMonitor(monitor); }
        return finish;
    }

    private void assertIsolated() { assertEquals("dev.engender.app.test.picker77", app.getPackageName()); }
    private void bootstrap(boolean reset) throws Exception {
        assertIsolated();
        CountDownLatch done = new CountDownLatch(1);
        app.sendOrderedBroadcast(new Intent().setComponent(new android.content.ComponentName(
            instrumentation.getContext().getPackageName(), BackupDocumentsProvider.Bootstrap.class.getName()))
            .putExtra("targetPackage", app.getPackageName()).putExtra("reset", reset), null,
            new android.content.BroadcastReceiver() {
                @Override public void onReceive(Context context, Intent intent) { done.countDown(); }
            }, null, 0, null, null);
        assertTrue("provider bootstrap timed out", done.await(10, TimeUnit.SECONDS));
    }
    private Uri create(String name) throws Exception {
        return DocumentsContract.createDocument(app.getContentResolver(), DocumentsContract.buildDocumentUriUsingTree(tree, "root"), "text/plain", name);
    }
    private void fault(String value) { app.getContentResolver().call(provider, "fault", value, null); }
    private boolean exists(Uri uri) throws Exception {
        try (Cursor rows = app.getContentResolver().query(DocumentsContract.buildChildDocumentsUriUsingTree(tree, "root"),
            new String[] {DocumentsContract.Document.COLUMN_DOCUMENT_ID}, null, null, null)) {
            while (rows.moveToNext()) if (rows.getString(0).equals(DocumentsContract.getDocumentId(uri))) return true;
            return false;
        }
    }
    private int pendingFiles() {
        java.io.File[] files = app.getCacheDir().listFiles((directory, name) -> name.startsWith("manual-export-") && name.endsWith(".pending"));
        return files == null ? 0 : files.length;
    }
    private static String hash(byte[] body) {
        try {
            StringBuilder out = new StringBuilder();
            for (byte value : java.security.MessageDigest.getInstance("SHA-256").digest(body)) out.append(String.format("%02x", value & 255));
            return out.toString();
        } catch (Exception error) { throw new AssertionError(error); }
    }
    private static final class CapturedCall extends PluginCall {
        final CountDownLatch done = new CountDownLatch(1);
        JSObject result;
        String error;
        String code;
        JSObject errorData;
        CapturedCall(String method, JSObject data) { super(null, "FileDelivery", UUID.randomUUID().toString(), method, data); }
        @Override public void resolve(JSObject value) { result = value; done.countDown(); }
        @Override public void resolve() { result = new JSObject(); done.countDown(); }
        @Override public void reject(String message, String code, Exception exception, JSObject data) {
            error = message; this.code = code; errorData = data; done.countDown();
        }
    }
}
