package dev.barankiewicz.genderdiary.keystore;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotEquals;
import static org.junit.Assume.assumeTrue;

import android.app.KeyguardManager;
import android.content.Context;
import android.os.Build;

import androidx.biometric.BiometricManager;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

import java.io.InputStream;

/**
 * Ticket 09 (sec-02-09): the two authenticator sets {@link KeystorePlugin}
 * actually asks {@link BiometricManager} about, proved on a device rather
 * than assumed from the SDK bump - androidx.biometric stayed pinned at
 * 1.1.0 here because nothing newer than that has shipped stable since 2021,
 * so what needs proving is that the pin still resolves both authenticator
 * paths correctly on a current OS.
 *
 * <p>What this deliberately does not do is drive {@code BiometricPrompt}
 * itself: {@code JournalKeystoreTest}'s header explains why an emulator
 * cannot be made to present a finger. {@link BiometricManager#canAuthenticate}
 * is the half that runs before any prompt, and it is what {@link
 * KeystorePlugin#reportedUnavailable} calls to decide whether to show one at
 * all - so it is the seam where "does this authenticator path still work"
 * has an answer a test rig can read.
 *
 * <p>Neither AVD {@code tests/android-tier/run.mjs} boots enrolls a
 * fingerprint, so the biometric-alone path is asserted only as "not a
 * success" rather than pinned to one specific error code - {@code
 * NO_HARDWARE} and {@code NONE_ENROLLED} both mean the app falls back to
 * offering the device credential, and which one a given emulator image
 * reports is not this ticket's claim. The device-credential path is the
 * deterministic half: with a lock screen set, it is always {@code SUCCESS},
 * on both the API 26 floor and current Android, which is the same reason
 * ticket 09's spec gives for keeping this library on the floor at all.
 */
@RunWith(AndroidJUnit4.class)
public class BiometricAuthenticatorAvailabilityTest {

    private static final String PIN = "1234";

    private static Context context() {
        return InstrumentationRegistry.getInstrumentation().getTargetContext();
    }

    private static String shell(String command) throws Exception {
        try (InputStream out =
                new java.io.FileInputStream(
                    InstrumentationRegistry.getInstrumentation()
                        .getUiAutomation()
                        .executeShellCommand(command)
                        .getFileDescriptor())) {
            java.io.ByteArrayOutputStream buffer = new java.io.ByteArrayOutputStream();
            byte[] chunk = new byte[4096];
            int read;
            while ((read = out.read(chunk)) != -1) buffer.write(chunk, 0, read);
            return buffer.toString();
        }
    }

    private static boolean deviceIsSecure() {
        KeyguardManager keyguard = (KeyguardManager) context().getSystemService(Context.KEYGUARD_SERVICE);
        return keyguard != null && keyguard.isDeviceSecure();
    }

    private static boolean isEmulator() {
        return Build.FINGERPRINT.startsWith("generic")
            || Build.HARDWARE.contains("ranchu")
            || Build.HARDWARE.contains("goldfish")
            || Build.PRODUCT.contains("sdk");
    }

    @Before
    public void ensureLockScreen() throws Exception {
        if (deviceIsSecure()) return;
        assumeTrue("no lock screen, and only an emulator's can be set from here", isEmulator());
        shell("locksettings set-pin " + PIN);
        assumeTrue("the emulator did not take a lock screen; nothing below can be asserted", deviceIsSecure());
    }

    @After
    public void tidy() throws Exception {
        if (isEmulator() && deviceIsSecure()) shell("locksettings clear --old " + PIN);
    }

    /** {@link KeystorePlugin#unlock} without {@code deviceCredential}, and
        {@link KeystorePlugin#confirm}: biometric hardware alone. Neither AVD
        enrolls a fingerprint, so the platform must not report a prompt worth
        showing. */
    @Test
    public void biometricAloneIsNotOfferedWithNothingEnrolled() {
        int availability =
            BiometricManager.from(context()).canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_STRONG);

        assertNotEquals(
            "a fresh emulator enrolled a fingerprint on its own",
            BiometricManager.BIOMETRIC_SUCCESS,
            availability);
        assertNotEquals(
            "KeystorePlugin.reportedUnavailable would show a prompt with nothing to authenticate against",
            BiometricOutcomes.AUTHENTICATED,
            BiometricOutcomes.forAvailability(availability));
    }

    /** {@link KeystorePlugin#unlock} with {@code deviceCredential} set - the
        path that exists, per ticket 09's spec, because below API 30
        {@code BiometricPrompt} has no built-in device-credential UI of its
        own. With a lock screen in place this must succeed regardless of the
        biometric sensor, on the API floor and on current Android alike. */
    @Test
    public void deviceCredentialAuthenticatesOnTheLockScreenAlone() {
        int authenticators =
            BiometricManager.Authenticators.BIOMETRIC_STRONG | BiometricManager.Authenticators.DEVICE_CREDENTIAL;
        int availability = BiometricManager.from(context()).canAuthenticate(authenticators);

        assertEquals(
            "a device with a lock screen refused the device-credential authenticator",
            BiometricManager.BIOMETRIC_SUCCESS,
            availability);
        assertEquals(
            BiometricOutcomes.AUTHENTICATED,
            BiometricOutcomes.forAvailability(availability));
    }
}
