package dev.engender.app.backup;

import static org.junit.Assert.*;
import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.provider.DocumentsContract;
import android.util.Base64;
import androidx.activity.result.ActivityResult;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;
import dev.engender.app.MainActivity;
import java.security.MessageDigest;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class AutoExportDestinationTest {
    private final Context app = InstrumentationRegistry.getInstrumentation().getTargetContext();
    private final Uri provider = Uri.parse("content://" + BackupDocumentsProvider.AUTHORITY);
    private final Uri tree = DocumentsContract.buildTreeDocumentUri(BackupDocumentsProvider.AUTHORITY, "root");

    private void bootstrap() throws Exception {
        CountDownLatch ready = new CountDownLatch(1);
        app.sendOrderedBroadcast(new Intent().setComponent(new android.content.ComponentName(
            InstrumentationRegistry.getInstrumentation().getContext().getPackageName(), BackupDocumentsProvider.Bootstrap.class.getName())).putExtra("targetPackage", app.getPackageName()), null,
            new android.content.BroadcastReceiver() {
                @Override public void onReceive(Context context, Intent intent) { ready.countDown(); }
            }, null, 0, null, null);
        assertTrue(ready.await(10, TimeUnit.SECONDS));
    }

    @Test public void temporarilyUnmountedFolderStaysEnabledAndRetries() throws Exception {
        bootstrap();
        SharedPreferences prefs = app.getSharedPreferences(AutoExportPlugin.PREFS, 0);
        prefs.edit().clear().putBoolean("enabled", true).putString("destinationUri", tree.toString()).commit();
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            scenario.onActivity(activity -> {
                AutoExportPlugin plugin = (AutoExportPlugin) activity.getBridge().getPlugin("AutoExport").getInstance();
                app.getContentResolver().call(provider, "fault", "unmounted", null);
                CapturedCall failed = deliver(plugin);
                assertEquals("destination-unavailable", failed.error);
                assertTrue(prefs.getBoolean("enabled", false));
                assertEquals(tree.toString(), prefs.getString("destinationUri", null));
                app.getContentResolver().call(provider, "fault", "none", null);
                assertNull(deliver(plugin).error);
            });
        } finally { app.getContentResolver().call(provider, "reset", null, null); AutoExportPlugin.wipe(app); }
    }

    @Test public void pickingAgainAndDisablingReleasePersistedGrants() throws Exception {
        bootstrap();
        Uri second = DocumentsContract.buildTreeDocumentUri(BackupDocumentsProvider.AUTHORITY, "root-second");
        int modes = Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION;
        app.getContentResolver().takePersistableUriPermission(tree, modes);
        app.getSharedPreferences(AutoExportPlugin.PREFS, 0).edit().putString("destinationUri", tree.toString()).commit();
        CapturedCall call = new CapturedCall("pickDestination", new JSObject());
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            scenario.onActivity(activity -> {
                try {
                    AutoExportPlugin plugin = (AutoExportPlugin) activity.getBridge().getPlugin("AutoExport").getInstance();
                    java.lang.reflect.Method picked = AutoExportPlugin.class.getDeclaredMethod("pickedDestination", PluginCall.class, ActivityResult.class);
                    picked.setAccessible(true);
                    picked.invoke(plugin, call, new ActivityResult(Activity.RESULT_OK, new Intent().setData(second).setFlags(modes)));
                } catch (Exception error) { throw new AssertionError(error); }
            });
            assertTrue("destination selection did not finish", call.completed.await(10, TimeUnit.SECONDS));
            assertNull(call.error);
            assertNotNull(call.result);
            assertFalse(holds(tree));
            assertTrue(holds(second));
            scenario.onActivity(activity -> {
                AutoExportPlugin plugin = (AutoExportPlugin) activity.getBridge().getPlugin("AutoExport").getInstance();
                CapturedCall disabled = new CapturedCall("configure", new JSObject().put("enabled", false));
                plugin.configure(disabled);
                assertNull(disabled.error);
                assertNotNull(disabled.result);
                assertFalse(holds(second));
            });
        } finally { AutoExportPlugin.wipe(app); }
    }

    private boolean holds(Uri uri) {
        return app.getContentResolver().getPersistedUriPermissions().stream().anyMatch(permission -> permission.getUri().equals(uri));
    }
    private CapturedCall deliver(AutoExportPlugin plugin) {
        try {
            java.io.ByteArrayOutputStream body = new java.io.ByteArrayOutputStream();
            java.io.DataOutputStream framing = new java.io.DataOutputStream(body);
            byte[] header = "{\"chunkSize\":1024,\"totalChunks\":1}".getBytes(java.nio.charset.StandardCharsets.UTF_8);
            framing.writeBytes("GDIARY");
            framing.writeShort(2);
            framing.writeInt(header.length);
            framing.write(header);
            framing.write(new byte[29]);
            byte[] bytes = body.toByteArray();
            CapturedCall begin = new CapturedCall("beginBackup", new JSObject().put("fileName", "proof.ttbackup"));
            plugin.beginBackup(begin);
            assertNull(begin.error);
            String id = begin.result.getString("transferId");
            plugin.appendBackup(new CapturedCall("appendBackup", new JSObject().put("transferId", id).put("offset", 0).put("base64", Base64.encodeToString(bytes, Base64.NO_WRAP))));
            StringBuilder sha = new StringBuilder();
            for (byte value : MessageDigest.getInstance("SHA-256").digest(bytes)) sha.append(String.format("%02x", value & 255));
            CapturedCall finish = new CapturedCall("finishBackup", new JSObject().put("transferId", id).put("byteLength", bytes.length).put("sha256", sha.toString()));
            plugin.finishBackup(finish);
            plugin.abortBackup(new CapturedCall("abortBackup", new JSObject().put("transferId", id)));
            return finish;
        } catch (Exception error) { throw new AssertionError(error); }
    }
    private static final class CapturedCall extends PluginCall {
        volatile JSObject result;
        volatile String error;
        final CountDownLatch completed = new CountDownLatch(1);
        CapturedCall(String method, JSObject data) { super(null, "AutoExport", UUID.randomUUID().toString(), method, data); }
        @Override public void resolve(JSObject value) { result = value; completed.countDown(); }
        @Override public void resolve() { result = new JSObject(); completed.countDown(); }
        @Override public void reject(String message, String code, Exception exception, JSObject data) { error = message; completed.countDown(); }
    }
}
