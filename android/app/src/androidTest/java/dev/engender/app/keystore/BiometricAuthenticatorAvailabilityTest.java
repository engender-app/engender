package dev.engender.app.keystore;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotEquals;
import static dev.engender.app.keystore.LockScreenTestSupport.context;
import static dev.engender.app.keystore.LockScreenTestSupport.deviceIsSecure;
import static dev.engender.app.keystore.LockScreenTestSupport.ensureLockScreen;
import static dev.engender.app.keystore.LockScreenTestSupport.isEmulator;
import static dev.engender.app.keystore.LockScreenTestSupport.clearLockScreen;

import androidx.biometric.BiometricManager;
import androidx.test.ext.junit.runners.AndroidJUnit4;

import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

/**
 * Exercise both authenticator sets from {@link KeystorePlugin} through
 * {@link BiometricManager#canAuthenticate} with androidx.biometric 1.1.0.
 * The AVDs have no enrolled fingerprint, so expect any non-success for
 * biometrics alone. Device credentials with a lock screen must report
 * {@code SUCCESS} at API 26 and on current Android. The emulator cannot
 * present a fingerprint to {@code BiometricPrompt}.
 */
@RunWith(AndroidJUnit4.class)
public class BiometricAuthenticatorAvailabilityTest {

    @Before
    public void ensureALockScreen() throws Exception {
        ensureLockScreen();
    }

    @After
    public void tidy() throws Exception {
        if (isEmulator() && deviceIsSecure()) clearLockScreen();
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
            "KeystorePlugin would show a prompt with nothing to authenticate against",
            BiometricOutcomes.AUTHENTICATED,
            BiometricOutcomes.forAvailability(availability));
    }

    /** {@link KeystorePlugin#unlock} with {@code deviceCredential} set - the
        path that exists because below API 30 {@code BiometricPrompt} has no
        built-in device-credential UI of its own. With a lock screen in place
        this must succeed regardless of the biometric sensor, on the API
        floor and on current Android alike. */
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
