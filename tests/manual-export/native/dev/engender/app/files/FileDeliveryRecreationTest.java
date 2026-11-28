package dev.engender.app.files;

import static org.junit.Assert.*;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.Context;
import android.content.Intent;
import android.provider.DocumentsContract;
import android.os.ParcelFileDescriptor;
import android.view.accessibility.AccessibilityNodeInfo;
import androidx.test.core.app.ActivityScenario;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.runner.lifecycle.ActivityLifecycleCallback;
import androidx.test.runner.lifecycle.ActivityLifecycleMonitorRegistry;
import androidx.test.runner.lifecycle.Stage;
import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;
import dev.engender.app.MainActivity;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.Test;

/** Exercises DocumentsUI and Capacitor's restored call, including its real arguments. */
public class FileDeliveryRecreationTest {
    private final Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();
    private final Context app = instrumentation.getTargetContext();

    @Test public void realPickerReturnsOneVerifiedSaveAfterRecreation() throws Exception {
        assertTrue("use an isolated package", app.getPackageName().startsWith("dev.engender.app.test."));
        String name = "engender-test-77-" + UUID.randomUUID() + ".ttbackup";
        byte[] bytes = "synthetic export across a real save picker".getBytes(StandardCharsets.UTF_8);
        CountDownLatch destroyed = new CountDownLatch(1);
        CountDownLatch completed = new CountDownLatch(1);
        AtomicInteger answers = new AtomicInteger();
        AtomicReference<MainActivity> original = new AtomicReference<>();
        AtomicReference<JSObject> result = new AtomicReference<>();
        ActivityLifecycleCallback lifecycle = (activity, stage) -> {
            if (!(activity instanceof MainActivity)) return;
            if (stage == Stage.DESTROYED && activity == original.get()) destroyed.countDown();
            if (stage == Stage.CREATED && original.get() != null && activity != original.get()) {
                ((MainActivity) activity).getBridge().getApp().setAppRestoredListener(value -> {
                    result.set(value.getWrappedResult());
                    answers.incrementAndGet();
                    completed.countDown();
                });
            }
        };
        AtomicInteger pickerLaunches = new AtomicInteger();
        Instrumentation.ActivityMonitor picker = new Instrumentation.ActivityMonitor() {
            @Override public Instrumentation.ActivityResult onStartActivity(Intent intent) {
                if (Intent.ACTION_CREATE_DOCUMENT.equals(intent.getAction())) {
                    assertEquals(name, intent.getStringExtra(Intent.EXTRA_TITLE));
                    assertEquals("application/octet-stream", intent.getType());
                    assertTrue(intent.hasCategory(Intent.CATEGORY_OPENABLE));
                    intent.putExtra(DocumentsContract.EXTRA_INITIAL_URI,
                        DocumentsContract.buildDocumentUri("com.android.externalstorage.documents", "primary:Download"));
                    pickerLaunches.incrementAndGet();
                }
                return null;
            }
        };
        instrumentation.addMonitor(picker);
        instrumentation.runOnMainSync(() -> ActivityLifecycleMonitorRegistry.getInstance().addLifecycleCallback(lifecycle));
        try {
            try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
                scenario.onActivity(activity -> {
                    original.set(activity);
                    FileDeliveryPlugin plugin = (FileDeliveryPlugin) activity.getBridge().getPlugin("FileDelivery").getInstance();
                    CapturedCall begin = new CapturedCall("beginFile", new JSObject().put("fileName", name).put("type", "application/octet-stream"));
                    plugin.beginFile(begin);
                    assertNull(begin.error);
                    String id = begin.result.getString("transferId");
                    CapturedCall append = new CapturedCall("appendFile", new JSObject().put("transferId", id).put("offset", 0)
                        .put("base64", android.util.Base64.encodeToString(bytes, android.util.Base64.NO_WRAP)));
                    plugin.appendFile(append);
                    assertNull(append.error);
                    plugin.finishFile(new CapturedCall("finishFile", new JSObject().put("transferId", id)
                        .put("byteLength", bytes.length).put("sha256", hash(bytes))));
                });
                instrumentation.runOnMainSync(() -> original.get().recreate());
                assertTrue("picker caller was not recreated", destroyed.await(15, TimeUnit.SECONDS));
                assertEquals(1, pickerLaunches.get());
                assertTrue("DocumentsUI did not offer Save in Downloads", clickSave(15000));
                assertTrue("restored picker never returned", completed.await(20, TimeUnit.SECONDS));
                assertEquals("FileDelivery", result.get().getString("pluginId"));
                assertEquals("finishFile", result.get().getString("methodName"));
                assertTrue("restored call failed: " + result.get(), result.get().getBoolean("success", false));
                assertTrue(result.get().getJSObject("data").getBoolean("saved", false));
                assertEquals("saved file must contain the verified export", new String(bytes, StandardCharsets.UTF_8),
                    shell("cat /sdcard/Download/" + name));
                assertTrue(shell("sha256sum /sdcard/Download/" + name).startsWith(hash(bytes) + " "));
                instrumentation.waitForIdleSync();
                assertEquals("one picker must produce one result", 1, answers.get());
            }
        } finally {
            instrumentation.removeMonitor(picker);
            instrumentation.runOnMainSync(() -> ActivityLifecycleMonitorRegistry.getInstance().removeLifecycleCallback(lifecycle));
            shell("rm -f /sdcard/Download/" + name);
        }
    }

    private boolean clickSave(long timeout) throws Exception {
        long deadline = android.os.SystemClock.elapsedRealtime() + timeout;
        while (android.os.SystemClock.elapsedRealtime() < deadline) {
            AccessibilityNodeInfo root = instrumentation.getUiAutomation().getRootInActiveWindow();
            if (root != null && root.getPackageName() != null && root.getPackageName().toString().contains("documentsui")) {
                boolean downloads = root.findAccessibilityNodeInfosByText("Download").stream()
                    .anyMatch(node -> ("Download".equals(String.valueOf(node.getText())) || "Downloads".equals(String.valueOf(node.getText()))));
                if (!downloads) { Thread.sleep(100); continue; }
                for (AccessibilityNodeInfo node : root.findAccessibilityNodeInfosByText("Save")) {
                    if (node.isEnabled() && node.isClickable() && "save".equalsIgnoreCase(String.valueOf(node.getText()))
                        && node.performAction(AccessibilityNodeInfo.ACTION_CLICK)) return true;
                }
            }
            Thread.sleep(100);
        }
        return false;
    }

    private String shell(String command) throws Exception {
        try (ParcelFileDescriptor descriptor = instrumentation.getUiAutomation().executeShellCommand(command);
             java.io.InputStream input = new ParcelFileDescriptor.AutoCloseInputStream(descriptor)) {
            java.io.ByteArrayOutputStream output = new java.io.ByteArrayOutputStream();
            byte[] buffer = new byte[8192];
            int read;
            while ((read = input.read(buffer)) != -1) output.write(buffer, 0, read);
            return output.toString(StandardCharsets.UTF_8.name());
        }
    }

    private static String hash(byte[] body) {
        try {
            StringBuilder result = new StringBuilder();
            for (byte value : MessageDigest.getInstance("SHA-256").digest(body)) result.append(String.format("%02x", value & 255));
            return result.toString();
        } catch (Exception error) { throw new AssertionError(error); }
    }

    private static final class CapturedCall extends PluginCall {
        JSObject result;
        String error;
        CapturedCall(String method, JSObject data) { super(null, "FileDelivery", UUID.randomUUID().toString(), method, data); }
        @Override public void resolve(JSObject value) { result = value; }
        @Override public void resolve() { result = new JSObject(); }
        @Override public void reject(String message, String code, Exception exception, JSObject data) { error = message; }
    }
}
