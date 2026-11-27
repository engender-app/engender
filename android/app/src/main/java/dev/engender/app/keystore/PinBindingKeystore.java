package dev.engender.app.keystore;

import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import java.nio.charset.StandardCharsets;
import java.security.KeyStore;

import javax.crypto.KeyGenerator;
import javax.crypto.Mac;
import javax.crypto.SecretKey;

/** Binds the PIN wrap to a non-exportable Android Keystore key.
 *
 * <p>The WebView combines the PIN with an HMAC signature over a fixed,
 * versioned label. Keystore keeps the signing key outside app files and
 * backups. HMAC makes the device value repeatable without a nonce. The PIN
 * is the prompt, so the device key can sign without a second prompt.
 *
 * <p>Keystore uses hardware where supported. {@code PinBindingKeystoreTest}
 * records the device's backing level. No signature is persisted and
 * {@link #erase()} deletes the alias.
 */
public final class PinBindingKeystore {

    /** The Keystore entry. Named for the app, since the keystore is shared,
        and apart from the journal key's own alias: one reset takes both, and
        neither is ever asked to do the other's job. */
    public static final String ALIAS = "engender-pin-binding";

    private static final String KEYSTORE = "AndroidKeyStore";
    private static final String MAC = "HmacSHA256";

    private PinBindingKeystore() {}

    /**
     * First run of PIN mode on this phone: mints the key and returns the
     * secret it yields for the label.
     *
     * <p>Replaces whatever was under the alias, which is correct - the caller
     * is about to write a keystore wrapped under the new secret, and a key
     * left by an abandoned attempt must not outlive it. Deleted rather than
     * left to the generator to overwrite: the replacement is the security
     * property here, not a convenience, so it is this method that performs it.
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

    /** The reset path, and a move out of PIN mode. */
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
