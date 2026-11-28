package dev.engender.app.photos;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.net.Uri;
import android.provider.DocumentsContract;
import android.util.Base64;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import dev.engender.app.MainActivity;
import dev.engender.app.backup.BackupDocumentsProvider;
import dev.engender.app.webview.WebViewProbe;
import java.io.OutputStream;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;

/**
 * A pick that returns after the app locked keeps its file behind the token
 * (PickedFiles), so the page can ask for the bytes again after the unlock
 * (stores/pendingPick.ts). Native holds the file; the lock does not touch it.
 */
@RunWith(AndroidJUnit4.class)
public class PickedThroughLockTest {
    private final Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();
    private final Context app = instrumentation.getTargetContext();

    @Test public void aDocumentPickedAfterTheLockIsStillReadableAfterTheUnlock() throws Exception {
        CountDownLatch ready = new CountDownLatch(1);
        app.sendOrderedBroadcast(new Intent().setComponent(new ComponentName(instrumentation.getContext().getPackageName(),
            BackupDocumentsProvider.Bootstrap.class.getName())).putExtra("targetPackage", app.getPackageName()), null,
            new android.content.BroadcastReceiver() {
                @Override public void onReceive(Context context, Intent intent) { ready.countDown(); }
            }, null, 0, null, null);
        assertTrue(ready.await(10, TimeUnit.SECONDS));
        Uri tree = DocumentsContract.buildTreeDocumentUri(BackupDocumentsProvider.AUTHORITY, "root");
        Uri document = DocumentsContract.createDocument(app.getContentResolver(),
            DocumentsContract.buildDocumentUriUsingTree(tree, "root"), "application/pdf", "picked.pdf");
        assertNotNull(document);
        byte[] body = "%PDF-picked-through-a-lock".getBytes(java.nio.charset.StandardCharsets.UTF_8);
        try (OutputStream output = app.getContentResolver().openOutputStream(document, "wt")) { output.write(body); }

        IntentFilter filter = new IntentFilter(Intent.ACTION_OPEN_DOCUMENT);
        filter.addCategory(Intent.CATEGORY_OPENABLE);
        filter.addDataType("*/*");
        Instrumentation.ActivityMonitor monitor = instrumentation.addMonitor(filter,
            new Instrumentation.ActivityResult(Activity.RESULT_OK, new Intent().setData(document)
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)), true);
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            WebViewProbe probe = new WebViewProbe(scenario, 60);
            // The page's own lock hook, as the activity calls it on a leave that gets no grace.
            probe.evaluate("window.__leaveCalls = 0; var hook = window.__lockOnLeaveFromNative;"
                + " window.__lockOnLeaveFromNative = function (own) { window.__leaveCalls++; return hook && hook(own); }; 1");
            String call = probe.startCall("Photos", "pickDocument", new JSONObject());
            JSONObject picked = probe.awaitCall(call);
            assertEquals(picked.toString(), "resolved", picked.getString("state"));
            String token = picked.getJSONObject("result").getString("token");
            assertNotNull(token);

            // Lock, wait out any teardown, "unlock" by simply reading again: nothing native changed.
            scenario.onActivity(activity -> activity.getBridge().getWebView()
                .evaluateJavascript("window.__lockOnLeaveFromNative && window.__lockOnLeaveFromNative(false);", null));
            Thread.sleep(1500);

            String read = probe.startCall("Photos", "readPickedChunk", new JSONObject().put("token", token));
            JSONObject chunk = probe.awaitCall(read);
            assertEquals(chunk.toString(), "resolved", chunk.getString("state"));
            JSONObject result = chunk.getJSONObject("result");
            assertEquals(new String(body, java.nio.charset.StandardCharsets.UTF_8),
                new String(Base64.decode(result.getString("base64"), Base64.DEFAULT), java.nio.charset.StandardCharsets.UTF_8));
            assertTrue(result.getBoolean("done"));
        } finally { instrumentation.removeMonitor(monitor); }
    }

    @Test public void aFileReadJustBeforeTheLockCanBeTakenBackAndReadAgain() throws Exception {
        CountDownLatch ready = new CountDownLatch(1);
        app.sendOrderedBroadcast(new Intent().setComponent(new ComponentName(instrumentation.getContext().getPackageName(),
            BackupDocumentsProvider.Bootstrap.class.getName())).putExtra("targetPackage", app.getPackageName()), null,
            new android.content.BroadcastReceiver() {
                @Override public void onReceive(Context context, Intent intent) { ready.countDown(); }
            }, null, 0, null, null);
        assertTrue(ready.await(10, TimeUnit.SECONDS));
        Uri tree = DocumentsContract.buildTreeDocumentUri(BackupDocumentsProvider.AUTHORITY, "root");
        Uri document = DocumentsContract.createDocument(app.getContentResolver(),
            DocumentsContract.buildDocumentUriUsingTree(tree, "root"), "application/pdf", "raced.pdf");
        byte[] body = "%PDF-read-then-locked".getBytes(java.nio.charset.StandardCharsets.UTF_8);
        try (OutputStream output = app.getContentResolver().openOutputStream(document, "wt")) { output.write(body); }
        IntentFilter filter = new IntentFilter(Intent.ACTION_OPEN_DOCUMENT);
        filter.addCategory(Intent.CATEGORY_OPENABLE);
        filter.addDataType("*/*");
        Instrumentation.ActivityMonitor monitor = instrumentation.addMonitor(filter,
            new Instrumentation.ActivityResult(Activity.RESULT_OK, new Intent().setData(document)
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)), true);
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            WebViewProbe probe = new WebViewProbe(scenario, 60);
            String token = probe.awaitCall(probe.startCall("Photos", "pickDocument", new JSONObject()))
                .getJSONObject("result").getString("token");
            // The page reads the whole file, then the lock lands before the screen gets it.
            JSONObject first = probe.awaitCall(probe.startCall("Photos", "readPickedChunk", new JSONObject().put("token", token)));
            assertTrue(first.getJSONObject("result").getBoolean("done"));
            JSONObject spent = probe.awaitCall(probe.startCall("Photos", "readPickedChunk", new JSONObject().put("token", token)));
            assertEquals("the token is spent", "rejected", spent.getString("state"));

            JSONObject reopened = probe.awaitCall(probe.startCall("Photos", "reopenPicked", new JSONObject().put("token", token)));
            assertTrue(reopened.toString(), reopened.getJSONObject("result").getBoolean("reopened"));
            JSONObject again = probe.awaitCall(probe.startCall("Photos", "readPickedChunk", new JSONObject().put("token", token)));
            assertEquals(new String(body, java.nio.charset.StandardCharsets.UTF_8),
                new String(Base64.decode(again.getJSONObject("result").getString("base64"), Base64.DEFAULT), java.nio.charset.StandardCharsets.UTF_8));
        } finally { instrumentation.removeMonitor(monitor); }
    }
}
