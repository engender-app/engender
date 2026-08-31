package dev.barankiewicz.genderdiary.keystore;

import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import java.nio.charset.StandardCharsets;
import java.security.KeyStore;

import javax.crypto.KeyGenerator;
import javax.crypto.Mac;
import javax.crypto.SecretKey;

/**
 * The device half of a PIN, held by the phone rather than by the WebView
 * (phase 5 security ticket sec-02-06, audit finding G-03).
 *
 * <p>PIN mode wraps the journal under the four digits joined with a secret
 * only this device can produce ({@code src/lib/data/device-secret.ts}). That
 * secret is an HMAC signature over one fixed, versioned label, and the whole
 * question this class answers is where the key doing the signing lives. In
 * the WebView's own key store it is app-private but on disk, in files sitting
 * beside {@code keystore.json} - so one copy of the app's directory takes
 * both halves of the secret and lands the copier in the 10,000-candidate
 * bucket the setup copy prices at about five seconds. Under a Keystore alias
 * the key material is not in that directory at all, and the platform will not
 * hand it out to anything, this app included. The same copy then yields
 * neither half.
 *
 * <p><b>No authentication, deliberately.</b> {@code
 * setUserAuthenticationRequired(false)}: the PIN is what the person is
 * typing, and a biometric or lock-screen prompt in front of it would be a
 * second gate nobody asked for - which is the whole reason a four-digit mode
 * exists. What the alias buys is not a second check on who is present; it is
 * that the key cannot be copied off the device. {@code ReminderPayloadStore}
 * makes the same trade for the same kind of reason.
 *
 * <p><b>HMAC rather than AES</b>, following the web module this mirrors: a
 * deterministic value out of a non-extractable AES key means encrypting a
 * fixed plaintext under a fixed nonce, which is safe with one plaintext and
 * one nonce but is exactly the shape a reader has to stop and check. A
 * signature over a label has no nonce and no reuse question.
 *
 * <p><b>Hardware-backed where the device offers it.</b> Keystore puts an HMAC
 * key in the TEE on devices whose keymaster implements it and in software
 * keymaster otherwise; either way the key material is outside this app's
 * files and outside a backup of them, which is the property the ticket needs.
 * {@code PinBindingKeystoreTest} logs what the device it runs on actually
 * says rather than asserting a level the platform does not promise.
 *
 * <p>Nothing is persisted beside the alias. The signature is a function of
 * the key and the label, so there is no blob to keep in step with it and
 * nothing for a reset to miss - {@link #erase()} is the whole of it.
 */
public final class PinBindingKeystore {

    /** The Keystore entry. Named for the app, since the keystore is shared,
        and apart from the journal key's own alias: one reset takes both, and
        neither is ever asked to do the other's job. */
    public static final String ALIAS = "gender-diary-pin-binding";

    private static final String KEYSTORE = "AndroidKeyStore";
    private static final String MAC = "HmacSHA256";

    private PinBindingKeystore() {}

    /**
     * First run of PIN mode on this phone: mints the key and returns the
     * secret it yields for the label.
     *
     * <p>Replaces whatever was under the alias, which is correct - the caller
     * is about to write a keystore wrapped under the new secret, and a key
     * left by an abandoned attempt must not outlive it.
     */
    public static String create(String label) throws Exception {
        erase();
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_HMAC_SHA256, KEYSTORE);
        generator.init(
            new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_SIGN)
                .setDigests(KeyProperties.DIGEST_SHA256)
                .setUserAuthenticationRequired(false)
                .build());
        return sign(generator.generateKey(), label);
    }

    /**
     * Every later unlock. Null when there is no key under the alias, which
     * never mints one: a fresh key would sign the same label to a different
     * value and present as an endlessly wrong PIN.
     */
    public static String read(String label) throws Exception {
        SecretKey key = (SecretKey) keystore().getKey(ALIAS, null);
        return key == null ? null : sign(key, label);
    }

    /** The reset path (ADR-0014), and a move out of PIN mode. */
    public static void erase() throws Exception {
        KeyStore keystore = keystore();
        if (keystore.containsAlias(ALIAS)) keystore.deleteEntry(ALIAS);
    }

    private static String sign(SecretKey key, String label) throws Exception {
        Mac mac = Mac.getInstance(MAC);
        mac.init(key);
        /* Base64 with no wrapping, because the value is joined to the PIN and
           handed to a KDF as one string: a newline in the middle of it would
           be part of the secret, which works right up until something
           normalizes it. */
        return Base64.encodeToString(mac.doFinal(label.getBytes(StandardCharsets.UTF_8)), Base64.NO_WRAP);
    }

    private static KeyStore keystore() throws Exception {
        KeyStore keystore = KeyStore.getInstance(KEYSTORE);
        keystore.load(null);
        return keystore;
    }
}
