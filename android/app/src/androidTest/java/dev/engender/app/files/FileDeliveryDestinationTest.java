package dev.engender.app.files;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.net.Uri;
import android.util.Base64;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;
import dev.engender.app.MainActivity;
import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.security.MessageDigest;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import org.junit.Test;
import org.junit.runner.RunWith;

/** GD-030: the URI a save handler returns is another app's answer, checked before it is opened. */
@RunWith(AndroidJUnit4.class)
public class FileDeliveryDestinationTest {
    private final Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();
    private final Context app = instrumentation.getTargetContext();

    @Test public void aSaveHandlerCannotPointTheExportAtTheWrappedKeyOrAnythingButADocument() throws Exception {
        File key = new File(app.getFilesDir(), "journal-key.wrapped");
        byte[] original = key.exists() ? Files.readAllBytes(key.toPath()) : null;
        byte[] sentinel = "wrapped-key-sentinel".getBytes(StandardCharsets.UTF_8);
        Files.write(key.toPath(), sentinel);
        byte[] expected = Files.readAllBytes(key.toPath());
        byte[] body = "private-journal-export".getBytes(StandardCharsets.UTF_8);
        String digest = sha256(body);
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            for (String returned : new String[] {
                Uri.fromFile(key).toString(),
                "android.resource://" + app.getPackageName() + "/raw/anything",
                "unknown-scheme://journal/key",
                "content://" + app.getPackageName() + ".camera-files/capture/capture.jpg"}) {
                IntentFilter filter = new IntentFilter(Intent.ACTION_CREATE_DOCUMENT);
                filter.addCategory(Intent.CATEGORY_OPENABLE);
                filter.addDataType("text/plain");
                Instrumentation.ActivityMonitor monitor = instrumentation.addMonitor(filter,
                    new Instrumentation.ActivityResult(Activity.RESULT_OK, new Intent().setData(Uri.parse(returned))), true);
                CapturedCall finish = new CapturedCall("finishFile", new JSObject());
                try {
                    scenario.onActivity(activity -> {
                        FileDeliveryPlugin plugin = (FileDeliveryPlugin) activity.getBridge().getPlugin("FileDelivery").getInstance();
                        CapturedCall begin = new CapturedCall("beginFile", new JSObject().put("fileName", "proof.txt").put("type", "text/plain"));
                        plugin.beginFile(begin);
                        assertNull(begin.error);
                        String id = begin.result.getString("transferId");
                        plugin.appendFile(new CapturedCall("appendFile", new JSObject().put("transferId", id).put("offset", 0)
                            .put("base64", Base64.encodeToString(body, Base64.NO_WRAP))));
                        finish.getData().put("transferId", id).put("byteLength", body.length).put("sha256", digest);
                        plugin.finishFile(finish);
                    });
                    assertTrue("save result never arrived for " + returned, finish.done.await(20, TimeUnit.SECONDS));
                    assertEquals(returned, "export-delivery-failed", finish.error);
                    assertArrayEquals("the key file was opened for " + returned, expected, Files.readAllBytes(key.toPath()));
                } finally { instrumentation.removeMonitor(monitor); }
            }
        } finally {
            if (original == null) key.delete(); else Files.write(key.toPath(), original);
        }
    }

    private static String sha256(byte[] bytes) throws Exception {
        StringBuilder hex = new StringBuilder();
        for (byte value : MessageDigest.getInstance("SHA-256").digest(bytes)) hex.append(String.format("%02x", value & 255));
        return hex.toString();
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
