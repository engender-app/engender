package dev.engender.app.keystore;

import static dev.engender.app.keystore.LockScreenTestSupport.*;
import static org.junit.Assert.*;
import static org.junit.Assume.assumeTrue;

import android.content.res.AssetManager;

import androidx.lifecycle.Lifecycle;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;
import dev.engender.app.MainActivity;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

/** A prompt requested after Home must answer without releasing a data key. */
@RunWith(AndroidJUnit4.class)
public class KeystorePromptLifecycleTest {
    private JournalKeystore keystore;
    private boolean createdLock;

    @Before public void prepare() throws Exception {
        assumeTrue("lifecycle fixture owns only an emulator", isEmulator());
        createdLock = !deviceIsSecure();
        ensureLockScreen();
        if (gateHost()) return;
        keystore = new JournalKeystore(context());
        keystore.erase();
        keystore.create(JournalKeystore.Variant.GATED);
    }

    @After public void tidy() throws Exception {
        if (gateHost()) return;
        if (keystore != null) keystore.erase();
        if (createdLock && isEmulator() && deviceIsSecure()) clearLockScreen();
    }

    @Test public void savedStateUnlockAnswersWithoutAKey() throws Exception { savedStateRequest("unlock"); }
    @Test public void savedStateConfirmationAnswersWithoutSuccess() throws Exception { savedStateRequest("confirm"); }

    @Test public void invalidPromptRejectsInsteadOfLeavingTheCallPending() throws Exception {
        assumeTrue("legacy credential UI has no biometric PromptInfo", android.os.Build.VERSION.SDK_INT >= 30);
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            CapturedCall call = new CapturedCall("confirm");
            call.getData().put("title", "");
            scenario.onActivity(activity -> ((KeystorePlugin) activity.getBridge().getPlugin("Keystore").getInstance()).confirm(call));
            assertTrue("invalid prompt never answered", call.done.await(5, TimeUnit.SECONDS));
            assertNotNull("invalid prompt was not rejected", call.rejected);
            assertNull(call.result);
        }
    }

    /** The host runner controls only when the real gate mounts and when Home
     * is pressed. All authentication still crosses the production bridge. */
    @Test public void coldGateHost() throws Exception {
        assumeTrue("explicit keyGateHost runner only", gateHost());
        assertTrue("gate host requires an isolated package", context().getPackageName().startsWith("dev.engender.app.test."));
        File bundle = new File(context().getFilesDir(), "key-gate-probe");
        copy(InstrumentationRegistry.getInstrumentation().getContext().getAssets(), "key-gate-probe", bundle);
        copy(context().getAssets(), "public/fonts", new File(bundle, "fonts"));
        context().getSharedPreferences(com.getcapacitor.plugin.WebView.WEBVIEW_PREFS_NAME, 0).edit()
            .putString(com.getcapacitor.plugin.WebView.CAP_SERVER_PATH, bundle.getAbsolutePath()).commit();
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            AtomicReference<MainActivity> current = new AtomicReference<>();
            scenario.onActivity(activity -> {
                current.set(activity);
                activity.getBridge().setServerBasePath(bundle.getAbsolutePath());
            });
            for (int second = 0; second < 180; second++) {
                InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> {
                    MainActivity activity = current.get();
                    activity.getBridge().getWebView().evaluateJavascript(
                        "window.keyGateNativeSaved=" + activity.getSupportFragmentManager().isStateSaved(), null);
                });
                Thread.sleep(1000);
            }
        }
    }

    private static boolean gateHost() {
        return "true".equals(InstrumentationRegistry.getArguments().getString("keyGateHost"));
    }

    private static void copy(AssetManager assets, String path, File target) throws Exception {
        String[] children = assets.list(path);
        if (children != null && children.length > 0) {
            if (!target.exists() && !target.mkdirs()) throw new java.io.IOException("cannot create " + target);
            for (String child : children) copy(assets, path + "/" + child, new File(target, child));
        } else {
            try (InputStream in = assets.open(path); FileOutputStream out = new FileOutputStream(target)) {
                byte[] bytes = new byte[8192];
                int count;
                while ((count = in.read(bytes)) != -1) out.write(bytes, 0, count);
            }
        }
    }

    private void savedStateRequest(String method) throws Exception {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            AtomicReference<MainActivity> activity = new AtomicReference<>();
            scenario.onActivity(activity::set);
            scenario.moveToState(Lifecycle.State.CREATED);
            CapturedCall call = new CapturedCall(method);
            InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> {
                MainActivity stopped = activity.get();
                assertTrue("fixture did not reach saved fragment state", stopped.getSupportFragmentManager().isStateSaved());
                KeystorePlugin plugin = (KeystorePlugin) stopped.getBridge().getPlugin("Keystore").getInstance();
                if ("unlock".equals(method)) plugin.unlock(call); else plugin.confirm(call);
            });
            assertTrue("saved-state " + method + " never answered", call.done.await(5, TimeUnit.SECONDS));
            assertNull("unexpected bridge rejection", call.rejected);
            assertEquals(BiometricOutcomes.CANCELLED, call.result.getString("outcome"));
            assertFalse("a stopped activity received a data key", call.result.has("hexKey"));
            scenario.moveToState(Lifecycle.State.RESUMED);
        }
    }

    private static final class CapturedCall extends PluginCall {
        final CountDownLatch done = new CountDownLatch(1);
        JSObject result;
        String rejected;
        CapturedCall(String method) {
            super(null, "Keystore", "saved-state-proof", method, new JSObject()
                .put("title", "Open journal").put("subtitle", "Confirm device access")
                .put("cancel", "Cancel").put("deviceCredential", true));
        }
        @Override public void resolve(JSObject value) { result = value; done.countDown(); }
        @Override public void reject(String message, String code, Exception exception, JSObject data) {
            rejected = message; done.countDown();
        }
    }
}
