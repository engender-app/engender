package dev.barankiewicz.genderdiary.keystore;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotEquals;
import static dev.barankiewicz.genderdiary.keystore.LockScreenTestSupport.context;
import static dev.barankiewicz.genderdiary.keystore.LockScreenTestSupport.deviceIsSecure;
import static dev.barankiewicz.genderdiary.keystore.LockScreenTestSupport.ensureLockScreen;
import static dev.barankiewicz.genderdiary.keystore.LockScreenTestSupport.isEmulator;
import static dev.barankiewicz.genderdiary.keystore.LockScreenTestSupport.clearLockScreen;

import androidx.biometric.BiometricManager;
import androidx.test.ext.junit.runners.AndroidJUnit4;

import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

/**
 * Ticket 09: the two authenticator sets {@link KeystorePlugin} actually asks
 * {@link BiometricManager} about, proved on a device rather than assumed
 * from the SDK bump - androidx.biometric stayed pinned at 1.1.0 here because
 * nothing newer than that has shipped stable since 2021, so what needs
 * proving is that the pin still resolves both authenticator paths correctly
 * on a current OS.
 *
 * <p>What this deliberately does not do is drive {@code BiometricPrompt}
 * itself: {@link JournalKeystoreTest}'s header explains why an emulator
 * cannot be made to present a finger. {@link BiometricManager#canAuthenticate}
 * is the half that runs before any prompt, and it is the seam where "does
 * this authenticator path still work" has an answer a test rig can read.
 *
 * <p>Neither AVD {@code tests/android-tier/run.mjs} boots enrolls a
 * fingerprint, so the biometric-alone path is asserted only as "not a
 * success" rather than pinned to one specific error code - {@code
 * NO_HARDWARE} and {@code NONE_ENROLLED} both mean the app falls back to
 * offering the device credential, and which one a given emulator image
 * reports is not this ticket's claim. The device-credential path is the
 * deterministic half: with a lock screen set, it is always {@code SUCCESS},
 * on both the API 26 floor and current Android, which is the same reason
 * the ticket gives for keeping this library on the floor at all.
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
