package dev.engender.app.backup;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.provider.DocumentsContract;
import androidx.activity.result.ActivityResult;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;
import dev.engender.app.MainActivity;
import java.io.File;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.file.Files;
import java.security.MessageDigest;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;

/** GD-049: the backup folder and the file a retry writes to are checked on every use. */
@RunWith(AndroidJUnit4.class)
public class BackupDestinationTrustTest {
    private final Context app = InstrumentationRegistry.getInstrumentation().getTargetContext();
    private final Uri provider = Uri.parse("content://" + BackupDocumentsProvider.AUTHORITY);
    private final Uri tree = DocumentsContract.buildTreeDocumentUri(BackupDocumentsProvider.AUTHORITY, "root");

    private void bootstrap() throws Exception {
        CountDownLatch ready = new CountDownLatch(1);
        app.sendOrderedBroadcast(new Intent().setComponent(new android.content.ComponentName(
            InstrumentationRegistry.getInstrumentation().getContext().getPackageName(), BackupDocumentsProvider.Bootstrap.class.getName()))
            .putExtra("targetPackage", app.getPackageName()), null,
            new android.content.BroadcastReceiver() {
                @Override public void onReceive(Context context, Intent intent) { ready.countDown(); }
            }, null, 0, null, null);
        assertTrue(ready.await(10, TimeUnit.SECONDS));
    }

    @Test public void aPickerAnswerThatIsNotAContentFolderIsRefusedAndNothingIsKept() throws Exception {
        bootstrap();
        File decoy = new File(app.getFilesDir(), "picked-decoy");
        Files.write(decoy.toPath(), new byte[] {1, 2, 3});
        SharedPreferences prefs = app.getSharedPreferences(AutoExportPlugin.PREFS, 0);
        prefs.edit().clear().commit();
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            for (String returned : new String[] {Uri.fromFile(decoy).toString(),
                "android.resource://" + app.getPackageName() + "/raw/x", "unknown://x/tree/y"}) {
                CapturedCall call = new CapturedCall("pickDestination", new JSObject());
                scenario.onActivity(activity -> {
                    try {
                        AutoExportPlugin plugin = (AutoExportPlugin) activity.getBridge().getPlugin("AutoExport").getInstance();
                        java.lang.reflect.Method picked = AutoExportPlugin.class.getDeclaredMethod("pickedDestination", PluginCall.class, ActivityResult.class);
                        picked.setAccessible(true);
                        picked.invoke(plugin, call, new ActivityResult(Activity.RESULT_OK, new Intent().setData(Uri.parse(returned))
                            .setFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION)));
                    } catch (Exception error) { throw new AssertionError(error); }
                });
                assertTrue(call.completed.await(10, TimeUnit.SECONDS));
                assertNotNull(returned, call.error);
                assertNull(returned, prefs.getString("destinationUri", null));
            }
        } finally { AutoExportPlugin.wipe(app); decoy.delete(); }
    }

    @Test public void aStoredFolderThatIsNotAContentFolderIsClearedWithoutBeingOpened() throws Exception {
        bootstrap();
        File decoy = new File(app.getFilesDir(), "stored-decoy");
        byte[] bytes = {9, 9, 9};
        Files.write(decoy.toPath(), bytes);
        SharedPreferences prefs = app.getSharedPreferences(AutoExportPlugin.PREFS, 0);
        try {
            for (String stored : new String[] {Uri.fromFile(decoy).toString(), "android.resource://x/raw/y"}) {
                prefs.edit().clear().putBoolean("enabled", true).putString("destinationUri", tree.toString()).commit();
                byte[] archive = new byte[64];
                String digest = sha256(archive);
                synchronized (BackupWork.OWNER) {
                    try (StagedBackup staged = new StagedBackup(new File(app.getCacheDir(), "trust-fixture.pending"))) {
                        staged.append(0, archive);
                        PersistentBackup.stage(app, staged, archive.length, digest, System.currentTimeMillis(), prefs.getLong("backupGeneration", 0));
                    }
                    JSONObject stage = new JSONObject(prefs.getString("encryptedStage", "{}")).put("target", Uri.fromFile(decoy).toString());
                    // The folder as a corrupted or forged preference would leave it.
                    prefs.edit().putString("encryptedStage", stage.toString()).putString("destinationUri", stored).commit();
                    try { PersistentBackup.deliver(app); fail("delivered to " + stored); }
                    catch (Exception refused) { assertEquals("destination-invalid", refused.getMessage()); }
                }
                assertNull("the folder was kept: " + stored, prefs.getString("destinationUri", null));
                assertFalse(prefs.getBoolean("enabled", true));
                assertEquals("destination-invalid", prefs.getString("lastFailureReason", null));
                assertNull(prefs.getString("encryptedStage", null));
                assertArrayEquals("the decoy was opened for " + stored, bytes, Files.readAllBytes(decoy.toPath()));
            }
        } finally { AutoExportPlugin.wipe(app); decoy.delete(); }
    }

    @Test public void aRetryNeverWritesOrDeletesAStagedTargetOutsideTheFolder() throws Exception {
        bootstrap();
        SharedPreferences prefs = app.getSharedPreferences(AutoExportPlugin.PREFS, 0);
        prefs.edit().clear().putBoolean("enabled", true).putString("destinationUri", tree.toString()).commit();
        Uri created = DocumentsContract.createDocument(app.getContentResolver(),
            DocumentsContract.buildDocumentUriUsingTree(tree, "root"), "application/octet-stream", "foreign.bin");
        assertNotNull(created);
        // The same file addressed outside the picked folder, with its own grant: reachable, but not a child of the tree.
        String id = DocumentsContract.getDocumentId(created);
        android.os.Bundle grant = new android.os.Bundle();
        grant.putString("targetPackage", app.getPackageName());
        app.getContentResolver().call(provider, "grantDocument", id, grant);
        Uri foreign = DocumentsContract.buildDocumentUri(BackupDocumentsProvider.AUTHORITY, id);
        byte[] kept = "another folder's file".getBytes(java.nio.charset.StandardCharsets.UTF_8);
        try (OutputStream output = app.getContentResolver().openOutputStream(foreign, "wt")) { output.write(kept); }
        File decoy = new File(app.getFilesDir(), "stage-decoy");
        byte[] decoyBytes = {7, 7};
        Files.write(decoy.toPath(), decoyBytes);
        try {
            for (String target : new String[] {foreign.toString(), Uri.fromFile(decoy).toString()}) {
                byte[] archive = new byte[64];
                String digest = sha256(archive);
                synchronized (BackupWork.OWNER) {
                    try (StagedBackup staged = new StagedBackup(new File(app.getCacheDir(), "trust-fixture.pending"))) {
                        staged.append(0, archive);
                        PersistentBackup.stage(app, staged, archive.length, digest, System.currentTimeMillis(), prefs.getLong("backupGeneration", 0));
                    }
                    JSONObject stage = new JSONObject(prefs.getString("encryptedStage", "{}")).put("target", target);
                    prefs.edit().putString("encryptedStage", stage.toString()).commit();
                    try { PersistentBackup.deliver(app); fail("an unframed archive cannot verify"); }
                    catch (Exception expected) { /* read-back fails after writing a fresh file */ }
                    // The target was never reused, and a replaced stage never deletes it.
                    assertFalse(target, new JSONObject(prefs.getString("encryptedStage", "{}")).optString("target").equals(target));
                    PersistentBackup.clear(app);
                }
                try (InputStream input = app.getContentResolver().openInputStream(foreign)) {
                    assertArrayEquals("the other folder's file changed for " + target, kept, input.readAllBytes());
                }
                assertArrayEquals(decoyBytes, Files.readAllBytes(decoy.toPath()));
            }
        } finally { AutoExportPlugin.wipe(app); decoy.delete(); app.getContentResolver().call(provider, "reset", null, null); }
    }

    private static String sha256(byte[] bytes) throws Exception {
        StringBuilder hex = new StringBuilder();
        for (byte value : MessageDigest.getInstance("SHA-256").digest(bytes)) hex.append(String.format("%02x", value & 255));
        return hex.toString();
    }

    private static final class CapturedCall extends PluginCall {
        volatile String error;
        final CountDownLatch completed = new CountDownLatch(1);
        CapturedCall(String method, JSObject data) { super(null, "AutoExport", UUID.randomUUID().toString(), method, data); }
        @Override public void resolve(JSObject value) { completed.countDown(); }
        @Override public void resolve() { completed.countDown(); }
        @Override public void reject(String message, String code, Exception exception, JSObject data) { error = message; completed.countDown(); }
    }
}
