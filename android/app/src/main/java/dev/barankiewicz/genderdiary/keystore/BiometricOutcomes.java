package dev.barankiewicz.genderdiary.keystore;

import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;

/**
 * Android's two biometric vocabularies, folded into the one the app reads
 * (ticket 13; src/lib/lock/biometric-outcome.ts is the other end of it).
 *
 * <p>There are two because Android asks the question twice. {@link
 * BiometricManager#canAuthenticate(int)} answers before a prompt is shown -
 * is there hardware, is anything enrolled on it - and {@code
 * BiometricPrompt.AuthenticationCallback} answers after, with a different
 * numbering that overlaps the first only by accident. Fifteen error codes
 * arrive between them and the app reacts to seven states, so the mapping has
 * to be written down somewhere; here, where it is a pure function of an int
 * and can be tested without a device.
 *
 * <p>The direction of every default is refusal. An error code nobody mapped
 * becomes {@link #FAILED}, never a success, because the failure mode the
 * ticket warns about is a platform growing a code and a truthy check letting
 * it through.
 */
public final class BiometricOutcomes {

    /** The platform is satisfied and the wrapped key may be used. */
    public static final String AUTHENTICATED = "authenticated";
    /** No biometric hardware, or hardware the platform will not talk to. */
    public static final String UNAVAILABLE = "unavailable";
    /** Hardware is there, nothing is enrolled on it. */
    public static final String UNENROLLED = "unenrolled";
    /** Dismissed: back button, negative button, or the system taking it away. */
    public static final String CANCELLED = "cancelled";
    /** Presented and rejected, or anything unrecognised. */
    public static final String FAILED = "failed";
    /** Too many rejections; the sensor is refusing more attempts. */
    public static final String LOCKED_OUT = "lockedOut";
    /** No lock screen at all, so there is nothing to fall back to and
        nothing to bind a Keystore key to. */
    public static final String NO_DEVICE_CREDENTIAL = "noDeviceCredential";
    /** Not a biometric state: the wrapped key itself is gone for good. */
    public static final String KEY_INVALIDATED = "keyInvalidated";

    private BiometricOutcomes() {}

    /**
     * What {@link BiometricManager#canAuthenticate(int)} said, before any
     * prompt. {@link #AUTHENTICATED} here means "a prompt is worth showing",
     * not that anyone has authenticated yet - the caller shows one next.
     */
    public static String forAvailability(int status) {
        switch (status) {
            case BiometricManager.BIOMETRIC_SUCCESS:
                return AUTHENTICATED;
            case BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED:
                return UNENROLLED;
            case BiometricManager.BIOMETRIC_ERROR_NO_HARDWARE:
            case BiometricManager.BIOMETRIC_ERROR_HW_UNAVAILABLE:
            case BiometricManager.BIOMETRIC_ERROR_UNSUPPORTED:
            case BiometricManager.BIOMETRIC_ERROR_SECURITY_UPDATE_REQUIRED:
            case BiometricManager.BIOMETRIC_STATUS_UNKNOWN:
                /* An unknown status is treated as unavailable rather than as
                   "try anyway": both offer the device credential, which is
                   the route that works when the sensor is the problem. */
                return UNAVAILABLE;
            default:
                return UNAVAILABLE;
        }
    }

    /**
     * What {@code onAuthenticationError} said, after a prompt was shown.
     *
     * <p>{@code ERROR_LOCKOUT_PERMANENT} joins {@code ERROR_LOCKOUT} rather
     * than getting a state of its own: both are the sensor refusing more
     * attempts, and both are cleared the same way, by the device credential.
     * A separate state would buy a different sentence and the same button.
     */
    public static String forPromptError(int errorCode) {
        switch (errorCode) {
            case BiometricPrompt.ERROR_HW_UNAVAILABLE:
            case BiometricPrompt.ERROR_HW_NOT_PRESENT:
            case BiometricPrompt.ERROR_SECURITY_UPDATE_REQUIRED:
                return UNAVAILABLE;
            case BiometricPrompt.ERROR_NO_BIOMETRICS:
                return UNENROLLED;
            case BiometricPrompt.ERROR_CANCELED:
            case BiometricPrompt.ERROR_USER_CANCELED:
            case BiometricPrompt.ERROR_NEGATIVE_BUTTON:
            case BiometricPrompt.ERROR_TIMEOUT:
                /* A prompt that timed out was not answered, which is what
                   being dismissed is; the way forward is the same. */
                return CANCELLED;
            case BiometricPrompt.ERROR_LOCKOUT:
            case BiometricPrompt.ERROR_LOCKOUT_PERMANENT:
                return LOCKED_OUT;
            case BiometricPrompt.ERROR_NO_DEVICE_CREDENTIAL:
                return NO_DEVICE_CREDENTIAL;
            case BiometricPrompt.ERROR_UNABLE_TO_PROCESS:
            case BiometricPrompt.ERROR_NO_SPACE:
            case BiometricPrompt.ERROR_VENDOR:
            default:
                /* Vendor errors are a numbering the vendor owns, so there is
                   nothing to map them to; "that didn't work, try again" is
                   both true and the only honest offer. */
                return FAILED;
        }
    }
}
