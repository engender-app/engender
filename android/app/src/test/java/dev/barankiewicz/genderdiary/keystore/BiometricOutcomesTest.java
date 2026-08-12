package dev.barankiewicz.genderdiary.keystore;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotEquals;

import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;

import org.junit.Test;

/**
 * Every biometric state, asserted without a device (ticket 13).
 *
 * <p>A JVM test rather than an instrumentation one, and deliberately: an
 * emulator can be made to report two or three of these - no hardware,
 * nothing enrolled - and cannot be made to report a vendor error, a
 * permanent lockout or a timeout. Those are the codes a real phone produces
 * and a test rig cannot, so the mapping is what gets asserted, exhaustively,
 * over the constants themselves. The instrumentation half
 * ({@code JournalKeystoreTest}) covers what only a device can answer: that
 * the key is in the Keystore and unusable without authentication.
 *
 * <p>The codes are read from androidx rather than written as numbers, so an
 * androidx upgrade that renumbered one would move this test with it.
 */
public class BiometricOutcomesTest {

    @Test
    public void everyAvailabilityStatusMapsToAStateTheAppKnows() {
        assertEquals(
            BiometricOutcomes.AUTHENTICATED,
            BiometricOutcomes.forAvailability(BiometricManager.BIOMETRIC_SUCCESS));
        assertEquals(
            BiometricOutcomes.UNENROLLED,
            BiometricOutcomes.forAvailability(BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED));
        assertEquals(
            BiometricOutcomes.UNAVAILABLE,
            BiometricOutcomes.forAvailability(BiometricManager.BIOMETRIC_ERROR_NO_HARDWARE));
        assertEquals(
            BiometricOutcomes.UNAVAILABLE,
            BiometricOutcomes.forAvailability(BiometricManager.BIOMETRIC_ERROR_HW_UNAVAILABLE));
        assertEquals(
            BiometricOutcomes.UNAVAILABLE,
            BiometricOutcomes.forAvailability(BiometricManager.BIOMETRIC_ERROR_UNSUPPORTED));
        assertEquals(
            BiometricOutcomes.UNAVAILABLE,
            BiometricOutcomes.forAvailability(BiometricManager.BIOMETRIC_ERROR_SECURITY_UPDATE_REQUIRED));
        assertEquals(
            BiometricOutcomes.UNAVAILABLE,
            BiometricOutcomes.forAvailability(BiometricManager.BIOMETRIC_STATUS_UNKNOWN));
    }

    @Test
    public void everyPromptErrorCodeMapsToAStateTheAppKnows() {
        assertEquals(
            BiometricOutcomes.UNAVAILABLE,
            BiometricOutcomes.forPromptError(BiometricPrompt.ERROR_HW_UNAVAILABLE));
        assertEquals(
            BiometricOutcomes.UNAVAILABLE,
            BiometricOutcomes.forPromptError(BiometricPrompt.ERROR_HW_NOT_PRESENT));
        assertEquals(
            BiometricOutcomes.UNAVAILABLE,
            BiometricOutcomes.forPromptError(BiometricPrompt.ERROR_SECURITY_UPDATE_REQUIRED));
        assertEquals(
            BiometricOutcomes.UNENROLLED,
            BiometricOutcomes.forPromptError(BiometricPrompt.ERROR_NO_BIOMETRICS));
        assertEquals(
            BiometricOutcomes.CANCELLED, BiometricOutcomes.forPromptError(BiometricPrompt.ERROR_CANCELED));
        assertEquals(
            BiometricOutcomes.CANCELLED,
            BiometricOutcomes.forPromptError(BiometricPrompt.ERROR_USER_CANCELED));
        assertEquals(
            BiometricOutcomes.CANCELLED,
            BiometricOutcomes.forPromptError(BiometricPrompt.ERROR_NEGATIVE_BUTTON));
        assertEquals(
            BiometricOutcomes.CANCELLED, BiometricOutcomes.forPromptError(BiometricPrompt.ERROR_TIMEOUT));
        assertEquals(
            BiometricOutcomes.LOCKED_OUT, BiometricOutcomes.forPromptError(BiometricPrompt.ERROR_LOCKOUT));
        assertEquals(
            BiometricOutcomes.LOCKED_OUT,
            BiometricOutcomes.forPromptError(BiometricPrompt.ERROR_LOCKOUT_PERMANENT));
        assertEquals(
            BiometricOutcomes.NO_DEVICE_CREDENTIAL,
            BiometricOutcomes.forPromptError(BiometricPrompt.ERROR_NO_DEVICE_CREDENTIAL));
        assertEquals(
            BiometricOutcomes.FAILED,
            BiometricOutcomes.forPromptError(BiometricPrompt.ERROR_UNABLE_TO_PROCESS));
        assertEquals(BiometricOutcomes.FAILED, BiometricOutcomes.forPromptError(BiometricPrompt.ERROR_NO_SPACE));
        assertEquals(BiometricOutcomes.FAILED, BiometricOutcomes.forPromptError(BiometricPrompt.ERROR_VENDOR));
    }

    /**
     * The ticket's warning, as a test: neither vocabulary may report a
     * success for anything but its own success value. A code the platform
     * grows tomorrow lands in the default, and the default must not unlock.
     */
    @Test
    public void nothingButASuccessEverReadsAsAuthenticated() {
        for (int code = -20; code <= 200; code++) {
            if (code != BiometricManager.BIOMETRIC_SUCCESS) {
                assertNotEquals(
                    "availability " + code + " read as authenticated",
                    BiometricOutcomes.AUTHENTICATED,
                    BiometricOutcomes.forAvailability(code));
            }
            assertNotEquals(
                "prompt error " + code + " read as authenticated",
                BiometricOutcomes.AUTHENTICATED,
                BiometricOutcomes.forPromptError(code));
        }
    }

    /** An unmapped code is a plain failure, which still offers a retry. */
    @Test
    public void anUnknownCodeIsAPlainFailure() {
        assertEquals(BiometricOutcomes.FAILED, BiometricOutcomes.forPromptError(9999));
        assertEquals(BiometricOutcomes.FAILED, BiometricOutcomes.forPromptError(-7));
    }
}
