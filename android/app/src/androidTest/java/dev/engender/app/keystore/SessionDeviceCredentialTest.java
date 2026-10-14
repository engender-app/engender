package dev.engender.app.keystore;

import static org.junit.Assert.*;
import static dev.engender.app.keystore.LockScreenTestSupport.*;

import android.view.accessibility.AccessibilityNodeInfo;
import android.graphics.Rect;
import android.accessibilityservice.AccessibilityServiceInfo;
import android.app.UiAutomation;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.lifecycle.Lifecycle;
import androidx.biometric.BiometricManager;
import static org.junit.Assume.assumeTrue;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import org.json.JSONObject;
import dev.engender.app.webview.WebViewProbe;
import dev.engender.app.MainActivity;
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
            WebViewProbe page = new WebViewProbe(scenario, 5);
            String biometric = page.startCall("Keystore", "confirm", prompt(false));
            assertNotEquals("authenticated", result(page, biometric).getString("outcome"));
            String credential = page.startCall("Keystore", "confirm", prompt(true));
            Thread.sleep(2000);
            assertTrue("credential request refused before a device prompt could answer", page.pending(credential));
            shell("input keyevent KEYCODE_BACK");
            Thread.sleep(500);
            shell("input keyevent KEYCODE_BACK");
            assertNotEquals("authenticated", result(page, credential).getString("outcome"));
        }
    }

    @Test public void deviceCredentialConfirmsAndUnwrapsColdStartKey() throws Exception {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            WebViewProbe page = new WebViewProbe(scenario, 5);
            String create = page.startCall("Keystore", "create", new JSONObject().put("authRequired", true));
            JSONObject created = result(page, create);
            assertEquals("created", created.getString("outcome"));
            String confirm = page.startCall("Keystore", "confirm", prompt(true));
            enterCredential(page, confirm);
            assertEquals("authenticated", result(page, confirm).getString("outcome"));
            String unlock = page.startCall("Keystore", "unlock", prompt(true));
            enterCredential(page, unlock);
            JSONObject unlocked = result(page, unlock);
            assertEquals("authenticated", unlocked.getString("outcome"));
            assertEquals(created.getString("hexKey"), unlocked.getString("hexKey"));
        }
    }

    private void enterCredential(WebViewProbe page, String call) throws Exception {
        Thread.sleep(2000);
        assertTrue("authentication answered without the credential", page.pending(call));
        UiAutomation automation = InstrumentationRegistry.getInstrumentation().getUiAutomation();
        AccessibilityServiceInfo info = automation.getServiceInfo();
        info.flags |= AccessibilityServiceInfo.FLAG_REPORT_VIEW_IDS;
        automation.setServiceInfo(info);
        AccessibilityNodeInfo root = automation.getRootInActiveWindow();
        assertTrue("credential field was not focused", focusCredentialField(root));
        shell("input text " + PIN);
        shell("input keyevent KEYCODE_ENTER");
        result(page, call);
    }

    private boolean focusCredentialField(AccessibilityNodeInfo node) throws Exception {
        if (node == null) return false;
        String id = node.getViewIdResourceName();
        if (id != null && (id.endsWith("/password_entry") || id.endsWith("/lockPassword"))) {
            Rect bounds = new Rect();
            node.getBoundsInScreen(bounds);
            shell("input tap " + bounds.centerX() + " " + bounds.centerY());
            return true;
        }
        for (int i = 0; i < node.getChildCount(); i++) {
            if (focusCredentialField(node.getChild(i))) return true;
        }
        return false;
    }

    private JSONObject prompt(boolean credential) throws Exception {
        return new JSONObject().put("title", "Open journal").put("subtitle", "Confirm device access")
            .put("cancel", "Cancel").put("deviceCredential", credential);
    }

    private JSONObject result(WebViewProbe page, String call) throws Exception {
        JSONObject answer = page.awaitCall(call);
        assertEquals(answer.toString(), "resolved", answer.getString("state"));
        return answer.getJSONObject("result");
    }
}
