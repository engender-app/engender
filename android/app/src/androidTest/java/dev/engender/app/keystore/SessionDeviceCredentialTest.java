package dev.engender.app.keystore;

import static org.junit.Assert.*;
import static dev.engender.app.keystore.LockScreenTestSupport.*;

import androidx.lifecycle.Lifecycle;
import androidx.biometric.BiometricManager;
import static org.junit.Assume.assumeTrue;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;
import dev.engender.app.MainActivity;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class SessionDeviceCredentialTest {
    @Before public void prepare() throws Exception {
        assumeTrue("credential input is restricted to an emulator", isEmulator());
        ensureLockScreen();
        assumeTrue("requires no enrolled strong biometric", BiometricManager.from(context()).canAuthenticate(
            BiometricManager.Authenticators.BIOMETRIC_STRONG) != BiometricManager.BIOMETRIC_SUCCESS);
    }
    @After public void tidy() throws Exception {
        if (isEmulator() && deviceIsSecure()) clearLockScreen();
    }

    @Test public void backgroundReturnOffersCredentialPromptWithoutBiometricEnrollment() throws Exception {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            scenario.moveToState(Lifecycle.State.CREATED);
            scenario.moveToState(Lifecycle.State.RESUMED);
            CapturedCall biometric = new CapturedCall(false);
            scenario.onActivity(activity -> plugin(activity).confirm(biometric));
            assertTrue("biometric refusal did not return", biometric.done.await(5, TimeUnit.SECONDS));
            assertNotEquals("authenticated", biometric.result.getString("outcome"));
            CapturedCall credential = new CapturedCall(true);
            scenario.onActivity(activity -> plugin(activity).confirm(credential));
            assertFalse("credential request refused before a device prompt could answer: " + credential.result,
                credential.done.await(2, TimeUnit.SECONDS));
            shell("input keyevent KEYCODE_BACK");
            Thread.sleep(500);
            shell("input keyevent KEYCODE_BACK");
            assertTrue("cancel did not finish credential prompt", credential.done.await(5, TimeUnit.SECONDS));
            assertNotEquals("authenticated", credential.result.getString("outcome"));
        }
    }

    @Test public void deviceCredentialConfirmsAndUnwrapsColdStartKey() throws Exception {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            CapturedCall create = new CapturedCall("create", new JSObject().put("authRequired", true));
            scenario.onActivity(activity -> plugin(activity).create(create));
            assertTrue("key creation did not return", create.done.await(5, TimeUnit.SECONDS));
            assertEquals("created", create.result.getString("outcome"));
            CapturedCall confirm = new CapturedCall(true);
            scenario.onActivity(activity -> plugin(activity).confirm(confirm));
            enterCredential(confirm);
            assertEquals("authenticated", confirm.result.getString("outcome"));
            CapturedCall unlock = new CapturedCall(true);
            scenario.onActivity(activity -> plugin(activity).unlock(unlock));
            enterCredential(unlock);
            assertEquals("authenticated", unlock.result.getString("outcome"));
            assertEquals(create.result.getString("hexKey"), unlock.result.getString("hexKey"));
        }
    }

    private void enterCredential(CapturedCall call) throws Exception {
        assertFalse("authentication answered without the credential", call.done.await(2, TimeUnit.SECONDS));
        shell("input text " + PIN);
        shell("input keyevent KEYCODE_ENTER");
        assertTrue("credential did not finish authentication", call.done.await(5, TimeUnit.SECONDS));
    }

    private KeystorePlugin plugin(MainActivity activity) {
        return (KeystorePlugin) activity.getBridge().getPlugin("Keystore").getInstance();
    }
    private static final class CapturedCall extends PluginCall {
        final CountDownLatch done = new CountDownLatch(1);
        JSObject result;
        CapturedCall(boolean credential) {
            this("confirm", new JSObject().put("title", "Open journal").put("subtitle", "Confirm device access")
                .put("cancel", "Cancel").put("deviceCredential", credential));
        }
        CapturedCall(String method, JSObject data) {
            super(null, "Keystore", "session-proof", method, data);
        }
        @Override public void resolve(JSObject value) { result = value; done.countDown(); }
    }
}
