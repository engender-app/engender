package dev.barankiewicz.genderdiary.keystore;

import android.security.keystore.KeyPermanentlyInvalidatedException;
import android.security.keystore.UserNotAuthenticatedException;
import android.util.Log;

import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;
import androidx.fragment.app.FragmentActivity;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.security.UnrecoverableKeyException;

import javax.crypto.Cipher;

/**
 * The bridge half of ticket 13: Android Keystore and the biometric prompt, as
 * five calls that {@code src/lib/lock/android-key.ts} reads.
 *
 * <p>Every answer is an outcome string from {@link BiometricOutcomes}, and a
 * data key rides along only with {@code authenticated}. Nothing here decides
 * whether the Journal opens - the Keystore decided that by unwrapping or by
 * refusing to - so a bug in this file cannot produce a key it was not given.
 * What it can do is describe a refusal wrongly, which is why the states are
 * kept apart rather than collapsed into "it didn't work".
 *
 * <p>The prompt does not quietly fall through to the device credential when
 * there is no usable biometric. The ticket is explicit that unavailable and
 * unenrolled must not result in an unlocked Journal, so those come back as
 * themselves and the screen offers the credential as something the person
 * chooses - {@code deviceCredential} on the next call - rather than as a
 * slide the app made on their behalf.
 */
@CapacitorPlugin(name = "Keystore")
public class KeystorePlugin extends Plugin {

    private static final String TAG = "Keystore";

    private JournalKeystore keystore;

    @Override
    public void load() {
        keystore = new JournalKeystore(getContext());
    }

    /** A first run against every later one. */
    @PluginMethod
    public void status(PluginCall call) {
        try {
            JSObject result = new JSObject();
            result.put("hasKey", keystore.hasKey());
            call.resolve(result);
        } catch (Exception e) {
            call.reject(message(e), e);
        }
    }

    /**
     * Mints and wraps the Journal's data key. Silent: the public half of the
     * Keystore pair needs no authentication (JournalKeystore's header says
     * why), so a first run does not open with a prompt about a Journal that
     * does not exist yet.
     */
    @PluginMethod
    public void create(PluginCall call) {
        if (!keystore.deviceIsSecure()) {
            /* Asked rather than caught: the platform's own refusal to bind a
               key to a lock screen that is not there arrives as an
               IllegalStateException, which says nothing a person can act on. */
            call.resolve(outcome(BiometricOutcomes.NO_DEVICE_CREDENTIAL, null));
            return;
        }
        try {
            call.resolve(outcome("created", keystore.create()));
        } catch (Exception e) {
            call.reject(message(e), e);
        }
    }

    /**
     * Prompts, then unwraps behind it.
     *
     * <p>{@code deviceCredential} is the way forward the screen offers after
     * an unavailable or unenrolled sensor: the same unwrap, authorized by the
     * device's own PIN, pattern or password instead of by a finger.
     */
    @PluginMethod
    public void unlock(PluginCall call) {
        FragmentActivity activity = activityOrReject(call);
        if (activity == null) return;

        boolean deviceCredential = Boolean.TRUE.equals(call.getBoolean("deviceCredential", false));
        int authenticators =
            deviceCredential
                ? BiometricManager.Authenticators.BIOMETRIC_STRONG
                    | BiometricManager.Authenticators.DEVICE_CREDENTIAL
                : BiometricManager.Authenticators.BIOMETRIC_STRONG;

        if (reportedUnavailable(call, authenticators)) return;

        /* Built before the prompt, so that a key the platform has thrown away
           is reported as that rather than after somebody authenticates for
           nothing. Below API 30 the key is time-bound, so building the cipher
           is itself an operation that needs authorizing and has to wait -
           null here means "prompt first, build after". */
        Cipher cipher;
        try {
            cipher = keystore.unwrapCipher();
        } catch (UserNotAuthenticatedException notYet) {
            cipher = null;
        } catch (KeyPermanentlyInvalidatedException | UnrecoverableKeyException gone) {
            call.resolve(outcome(BiometricOutcomes.KEY_INVALIDATED, null));
            return;
        } catch (Exception e) {
            call.reject(message(e), e);
            return;
        }

        prompt(activity, call, cipher, authenticators, deviceCredential, this::unwrapInto);
    }

    /**
     * The same prompt with no key behind it, for the app-lock screen reached
     * mid-session (ticket 17's gate).
     *
     * <p>Nothing cryptographic happens here, and nothing should: by then the
     * data key is already unwrapped and in memory, and app lock is a
     * casual-access gate rather than an encryption credential (ADR-0014).
     * What this answers is whether the platform recognises the person holding
     * the phone, which is the question the PIN pad beside it asks too.
     */
    @PluginMethod
    public void confirm(PluginCall call) {
        FragmentActivity activity = activityOrReject(call);
        if (activity == null) return;

        int authenticators = BiometricManager.Authenticators.BIOMETRIC_STRONG;
        if (reportedUnavailable(call, authenticators)) return;

        prompt(
            activity,
            call,
            null,
            authenticators,
            false,
            (answered, result) -> answered.resolve(outcome(BiometricOutcomes.AUTHENTICATED, null)));
    }

    /** The reset path (ADR-0014), and the half of it that is not in OPFS. */
    @PluginMethod
    public void erase(PluginCall call) {
        try {
            keystore.erase();
            call.resolve();
        } catch (Exception e) {
            call.reject(message(e), e);
        }
    }

    /* --- the prompt -------------------------------------------------------- */

    /** What a successful prompt does next. The two callers differ only here. */
    private interface OnAuthenticated {
        void run(PluginCall call, BiometricPrompt.AuthenticationResult result);
    }

    private void unwrapInto(PluginCall call, BiometricPrompt.AuthenticationResult result) {
        try {
            /* The cipher the prompt authorized, where the platform can carry
               one; otherwise one built now, inside the window the prompt has
               just opened. */
            Cipher authorized =
                result.getCryptoObject() != null
                    ? result.getCryptoObject().getCipher()
                    : keystore.unwrapCipher();
            call.resolve(outcome(BiometricOutcomes.AUTHENTICATED, keystore.unwrap(authorized)));
        } catch (KeyPermanentlyInvalidatedException | UnrecoverableKeyException gone) {
            call.resolve(outcome(BiometricOutcomes.KEY_INVALIDATED, null));
        } catch (Exception e) {
            /* Authenticated, and the unwrap failed anyway. Not a key, and not
               a lie about why: a plain failure leaves the retry on offer, and
               the exception goes where an exception belongs. */
            Log.e(TAG, "the unwrap failed after a successful prompt", e);
            call.resolve(outcome(BiometricOutcomes.FAILED, null));
        }
    }

    private void prompt(
        FragmentActivity activity,
        PluginCall call,
        Cipher cipher,
        int authenticators,
        boolean deviceCredential,
        OnAuthenticated onAuthenticated) {

        BiometricPrompt.PromptInfo.Builder info =
            new BiometricPrompt.PromptInfo.Builder()
                .setTitle(text(call, "title"))
                .setSubtitle(text(call, "subtitle"))
                .setAllowedAuthenticators(authenticators);
        /* The platform requires a negative button unless the device
           credential is allowed, and forbids one when it is. */
        if (!deviceCredential) info.setNegativeButtonText(text(call, "cancel"));

        BiometricPrompt.AuthenticationCallback callback =
            new BiometricPrompt.AuthenticationCallback() {
                @Override
                public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult result) {
                    onAuthenticated.run(call, result);
                }

                @Override
                public void onAuthenticationError(int errorCode, CharSequence errString) {
                    call.resolve(outcome(BiometricOutcomes.forPromptError(errorCode), null));
                }

                /* onAuthenticationFailed is deliberately not overridden. It
                   fires per unrecognised finger while the prompt stays up and
                   the platform keeps asking; resolving there would answer the
                   call while Android's own dialog was still on screen. Every
                   prompt ends in one of the two above. */
            };

        activity.runOnUiThread(
            () -> {
                BiometricPrompt biometricPrompt =
                    new BiometricPrompt(activity, ContextCompat.getMainExecutor(getContext()), callback);
                if (cipher != null) {
                    biometricPrompt.authenticate(info.build(), new BiometricPrompt.CryptoObject(cipher));
                } else {
                    biometricPrompt.authenticate(info.build());
                }
            });
    }

    /**
     * Answers the call and returns true when there is no point showing a
     * prompt - no sensor, or nothing enrolled on it. Asked before a dialog is
     * built, so those two states are reported without one appearing.
     */
    private boolean reportedUnavailable(PluginCall call, int authenticators) {
        int availability = BiometricManager.from(getContext()).canAuthenticate(authenticators);
        if (availability == BiometricManager.BIOMETRIC_SUCCESS) return false;
        call.resolve(outcome(BiometricOutcomes.forAvailability(availability), null));
        return true;
    }

    private FragmentActivity activityOrReject(PluginCall call) {
        FragmentActivity activity = (FragmentActivity) getActivity();
        if (activity == null) call.reject("there is no activity to show the prompt on");
        return activity;
    }

    /* --- answers ----------------------------------------------------------- */

    /** One answer shape for every path: an outcome, and a key only with a
        success. The key leaves as hex, which is what SQLCipher's raw-key open
        takes and what android-driver.ts hands back to it unchanged. */
    private static JSObject outcome(String outcome, byte[] dataKey) {
        JSObject result = new JSObject();
        result.put("outcome", outcome);
        if (dataKey != null) result.put("hexKey", hex(dataKey));
        return result;
    }

    private static String hex(byte[] bytes) {
        StringBuilder out = new StringBuilder(bytes.length * 2);
        for (byte b : bytes) out.append(String.format("%02x", b));
        return out.toString();
    }

    /** Prompt copy comes from the catalogue through the bridge, so the dialog
        Android draws is in the language the app is in. */
    private static String text(PluginCall call, String key) {
        String value = call.getString(key);
        return value == null ? "" : value;
    }

    private static String message(Exception e) {
        String detail = e.getMessage();
        return detail == null || detail.isEmpty() ? e.getClass().getName() : detail;
    }
}
