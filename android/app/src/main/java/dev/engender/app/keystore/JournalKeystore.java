package dev.engender.app.keystore;

import android.app.KeyguardManager;
import android.content.Context;
import android.os.Build;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.security.KeyPairGenerator;
import java.security.KeyStore;
import java.security.PrivateKey;
import java.security.PublicKey;
import java.security.SecureRandom;
import java.security.spec.MGF1ParameterSpec;

import javax.crypto.Cipher;
import javax.crypto.spec.OAEPParameterSpec;
import javax.crypto.spec.PSource;

/**
 * Where the Journal's data key lives on Android.
 *
 * <p>The key itself is 32 random bytes, the same key the web mints and wraps
 * under a passphrase. Here it is wrapped by a key pair that Android Keystore
 * generated and will not hand out: the private half never leaves the
 * platform's keystore, and it is bound to the device's lock screen, so it
 * cannot be used until Android says somebody authenticated. A copy of the
 * app's files therefore yields the wrapped blob and nothing that opens it,
 * which is the claim {@code AndroidEncryptionClaimTest} proves by reading
 * the bytes.
 *
 * <p><b>Why a key pair rather than AES.</b> A user-authentication-bound
 * symmetric key requires authentication for encryption as well as
 * decryption, which would mean a biometric prompt on a first run - before
 * there is a Journal, to protect nothing - and would leave the wrap itself
 * untestable without a person's finger. With RSA the public half wraps
 * freely and only the private half asks. First run is silent; every later
 * boot asks; and the instrumentation test can create a real key on a real
 * device and then prove that unwrapping it without authenticating fails.
 *
 * <p><b>Two ways to be authorized</b>, because the platform changed. From
 * API 30 the key is per-use authorized and the prompt carries the very
 * {@link Cipher} it authorizes, so nothing but that operation is unlocked.
 * Below 30, {@code CryptoObject} cannot be combined with the device
 * credential at all, so the key is authorized for a few seconds after a
 * successful prompt instead and the unwrap happens inside that window. The
 * weaker of the two is the one the platform offers there.
 *
 * <p><b>The cliff, stated once.</b> A Keystore key bound to the lock screen
 * is destroyed by the platform when that lock screen is removed. The wrapped
 * blob outlives the key that opens it, so this file has nothing left to give:
 * that is the Android shape of "forgotten credentials have no
 * data-preserving recovery", it is reported as its own state rather than as a
 * failed finger (BiometricOutcomes.KEY_INVALIDATED), and the copy that tells
 * people to keep a screen lock and export Archives is the mitigation.
 *
 * <p>The journal itself can now survive that, which is a claim
 * about a different file rather than about this one. A recovery key seals the
 * same 32 bytes under 120 bits somebody wrote down, in recovery-key.json,
 * which no Keystore alias is involved in - so a destroyed alias is no longer
 * the end of the journal for anyone who made one. Nothing here changes: this
 * class still holds a blob it cannot open, and it is not what opens it. The
 * entry path that offers the written key is AndroidKeyGate's, on the
 * invalidated screen this paragraph describes: where a recovery key exists
 * that screen leads with it rather than offering a reset and nothing else.
 */
public final class JournalKeystore {

    public enum Variant {
        GATED("engender-journal-key", "journal-key.wrapped", true),
        UNLOCKED("engender-unlocked-key", "journal-unlocked-key.wrapped", false);

        public final String alias;
        public final String filename;
        public final boolean authRequired;

        Variant(String alias, String filename, boolean authRequired) {
            this.alias = alias;
            this.filename = filename;
            this.authRequired = authRequired;
        }
    }

    /** The legacy / gated alias, preserved for existing installations and tests. */
    public static final String ALIAS = Variant.GATED.alias;
    public static final String UNLOCKED_ALIAS = Variant.UNLOCKED.alias;

    /** The wrapped data key, in app-private storage beside the database. */
    public static final String WRAPPED_KEY_FILE = Variant.GATED.filename;
    public static final String UNLOCKED_WRAPPED_KEY_FILE = Variant.UNLOCKED.filename;

    /** The data key: 32 bytes, handed to SQLCipher raw. */
    private static final int DATA_KEY_BYTES = 32;

    /** How long a successful prompt authorizes the key for, below API 30.
        Long enough for the unwrap that follows it immediately, short enough
        that a phone put down authorized is not a phone left open. */
    private static final int AUTH_VALIDITY_SECONDS = 10;

    private static final String KEYSTORE = "AndroidKeyStore";
    private static final String TRANSFORMATION = "RSA/ECB/OAEPWithSHA-256AndMGF1Padding";

    private final Context context;

    public JournalKeystore(Context context) {
        this.context = context.getApplicationContext();
    }

    /** Whether a lock screen exists at all. Without one the platform refuses
        to make a key bound to it, so this is asked before creating rather
        than caught after. */
    public boolean deviceIsSecure() {
        KeyguardManager keyguard = (KeyguardManager) context.getSystemService(Context.KEYGUARD_SERVICE);
        return keyguard != null && keyguard.isDeviceSecure();
    }

    /** True when this device holds a key for the given variant. */
    public boolean hasVariant(Variant variant) throws Exception {
        return keystoreEntryExists(variant) && wrappedKeyFile(variant).exists();
    }

    /** True when this device already holds a Journal key in either variant. */
    public boolean hasKey() throws Exception {
        return activeVariant() != null;
    }

    /** Returns the active variant. Gated wins over unlocked if both exist
        (for instance, after an interrupted mode switch), maintaining the
        property that a crash never downgrades to a weaker mode. */
    public Variant activeVariant() throws Exception {
        if (hasVariant(Variant.GATED)) return Variant.GATED;
        if (hasVariant(Variant.UNLOCKED)) return Variant.UNLOCKED;
        return null;
    }

    /** First run: mints a data key and wraps it under the gated variant. */
    public byte[] create() throws Exception {
        return create(Variant.GATED);
    }

    /** First run with explicit variant choice. */
    public byte[] create(Variant variant) throws Exception {
        byte[] dataKey = new byte[DATA_KEY_BYTES];
        new SecureRandom().nextBytes(dataKey);
        wrap(variant, dataKey);
        return dataKey;
    }

    /**
     * Wraps an existing data key under the chosen Keystore variant.
     * Rewraps without re-encrypting the database.
     */
    public void wrap(Variant variant, byte[] dataKey) throws Exception {
        erase(variant);

        PublicKey wrappingKey = generateKeyPair(variant);

        Cipher cipher = Cipher.getInstance(TRANSFORMATION);
        cipher.init(Cipher.ENCRYPT_MODE, wrappingKey, oaepParameters());
        writeWrappedKey(variant, cipher.doFinal(dataKey));
    }

    /**
     * Directly unwrap an unlocked key without requiring any authentication
     * prompt.
     */
    public byte[] unwrapUnlocked() throws Exception {
        Cipher cipher = Cipher.getInstance(TRANSFORMATION);
        cipher.init(Cipher.DECRYPT_MODE, privateKey(Variant.UNLOCKED), oaepParameters());
        return cipher.doFinal(readWrappedKey(Variant.UNLOCKED));
    }

    /**
     * The cipher a successful prompt authorizes, initialized against the
     * stored key.
     *
     * <p>Throws {@code KeyPermanentlyInvalidatedException} when the lock
     * screen the key was bound to is gone, and {@code
     * UserNotAuthenticatedException} below API 30, where initializing a
     * time-bound key is itself an authorized operation. The caller treats
     * the second as "prompt first, then ask again", which is what {@link
     * #authorizesTheCipherItself()} distinguishes.
     */
    public Cipher unwrapCipher() throws Exception {
        Variant active = activeVariant();
        if (active == null) throw new IllegalStateException("there is no Journal key in the keystore");
        return unwrapCipher(active);
    }

    public Cipher unwrapCipher(Variant variant) throws Exception {
        Cipher cipher = Cipher.getInstance(TRANSFORMATION);
        cipher.init(Cipher.DECRYPT_MODE, privateKey(variant), oaepParameters());
        return cipher;
    }

    /** Runs the unwrap, once the cipher is authorized. */
    public byte[] unwrap(Cipher cipher) throws Exception {
        Variant active = activeVariant();
        if (active == null) throw new IllegalStateException("there is no Journal key in the keystore");
        return unwrap(active, cipher);
    }

    public byte[] unwrap(Variant variant, Cipher cipher) throws Exception {
        return cipher.doFinal(readWrappedKey(variant));
    }

    /**
     * Whether the prompt can carry the cipher it authorizes. True from API
     * 30, where {@code CryptoObject} works alongside the device credential;
     * below that the key is authorized for {@link #AUTH_VALIDITY_SECONDS}
     * instead and the cipher is built after the prompt returns.
     */
    public static boolean authorizesTheCipherItself() {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.R;
    }

    /**
     * How long an authentication keeps the key usable, where the platform
     * measures that in seconds at all. Zero from API 30, where authorization
     * belongs to one operation and expires with it.
     */
    public static int authorizationWindowSeconds() {
        return authorizesTheCipherItself() ? 0 : AUTH_VALIDITY_SECONDS;
    }

    /**
     * The reset path: both wrapped keys go with the Journal.
     */
    public void erase() throws Exception {
        erase(Variant.GATED);
        erase(Variant.UNLOCKED);
    }

    public void erase(Variant variant) throws Exception {
        File wrapped = wrappedKeyFile(variant);
        if (wrapped.exists() && !wrapped.delete()) {
            throw new IOException("could not delete " + wrapped);
        }
        KeyStore keystore = loadKeystore();
        if (keystore.containsAlias(variant.alias)) keystore.deleteEntry(variant.alias);
    }

    /* --- the parts above, in Keystore terms -------------------------------- */

    /* setUserAuthenticationValidityDurationSeconds is deprecated in favour of
       setUserAuthenticationParameters, which is API 30 and above - so the
       deprecated call is the only one there is below 30, and the branch that
       chooses between them is right here. */
    @SuppressWarnings("deprecation")
    private PublicKey generateKeyPair(Variant variant) throws Exception {
        KeyGenParameterSpec.Builder spec =
            new KeyGenParameterSpec.Builder(variant.alias, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setKeySize(2048)
                .setDigests(KeyProperties.DIGEST_SHA256)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_RSA_OAEP)
                .setUserAuthenticationRequired(variant.authRequired);

        /* From API 35 the MGF1 digest has to be declared on the key itself
           rather than left to inherit SHA-1; the platform has been moving
           toward refusing the inherited default outright. The digest stays
           SHA-1, for the reason given at oaepParameters(): AndroidKeyStore
           leaves MGF1 at SHA-1 regardless of setDigests, and the public-key
           half in oaepParameters() is pinned to match it. Guarded by API
           level because setMgf1Digests does not exist below it, and an
           existing key predates this call, so it keeps whatever MGF1 digest
           it was made with - unaffected, since this only runs inside
           create(). */
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.VANILLA_ICE_CREAM) {
            spec.setMgf1Digests(KeyProperties.DIGEST_SHA1);
        }

        /* A newly enrolled fingerprint does not destroy the Journal. The
           threat that setting guards against is somebody adding their own
           finger to a phone they took, and the lock screen they would need
           in order to do that is the same one that authorizes the key - so
           it buys nothing here and costs a Journal. */
        spec.setInvalidatedByBiometricEnrollment(false);

        if (variant.authRequired) {
            if (authorizesTheCipherItself()) {
                // 0 seconds: authorization does not outlive the operation it was
                // granted for, and the operation is the one in the CryptoObject.
                spec.setUserAuthenticationParameters(
                    0, KeyProperties.AUTH_BIOMETRIC_STRONG | KeyProperties.AUTH_DEVICE_CREDENTIAL);
            } else {
                spec.setUserAuthenticationValidityDurationSeconds(AUTH_VALIDITY_SECONDS);
            }
        }

        KeyPairGenerator generator = KeyPairGenerator.getInstance(KeyProperties.KEY_ALGORITHM_RSA, KEYSTORE);
        generator.initialize(spec.build());
        return generator.generateKeyPair().getPublic();
    }

    private PrivateKey privateKey(Variant variant) throws Exception {
        PrivateKey key = (PrivateKey) loadKeystore().getKey(variant.alias, null);
        if (key == null) throw new IllegalStateException("there is no Journal key in the keystore for " + variant.alias);
        return key;
    }

    /**
     * OAEP with SHA-256 throughout, passed explicitly on both sides.
     *
     * <p>Not a detail that can be left to the default: AndroidKeyStore reads
     * the digest from the transformation string but leaves MGF1 on SHA-1,
     * while the default provider used for the public-key half applies SHA-256
     * to both. Wrapping and unwrapping would then disagree about the padding
     * and the unwrap would fail as a decryption error, which on this path
     * reads as a lost Journal.
     */
    private static OAEPParameterSpec oaepParameters() {
        return new OAEPParameterSpec(
            "SHA-256", "MGF1", MGF1ParameterSpec.SHA1, PSource.PSpecified.DEFAULT);
    }

    private boolean keystoreEntryExists(Variant variant) throws Exception {
        return loadKeystore().containsAlias(variant.alias);
    }

    private static KeyStore loadKeystore() throws Exception {
        KeyStore keystore = KeyStore.getInstance(KEYSTORE);
        keystore.load(null);
        return keystore;
    }

    /* --- the blob ---------------------------------------------------------- */

    /** Exposed so the claim test can read the bytes a thief would read. */
    public File wrappedKeyFile() {
        return wrappedKeyFile(Variant.GATED);
    }

    public File wrappedKeyFile(Variant variant) {
        return new File(context.getFilesDir(), variant.filename);
    }

    private void writeWrappedKey(Variant variant, byte[] wrapped) throws IOException {
        File file = wrappedKeyFile(variant);
        File parent = file.getParentFile();
        if (parent != null && !parent.exists() && !parent.mkdirs()) {
            throw new IOException("could not create " + parent);
        }
        try (FileOutputStream out = new FileOutputStream(file)) {
            out.write(wrapped);
            /* The wrap is the only copy of what opens the Journal, and the
               next thing that happens is a database being written under it.
               A blob still in the page cache when the power goes is a
               Journal nobody can open. */
            out.getFD().sync();
        }
    }

    private byte[] readWrappedKey(Variant variant) throws IOException {
        return Files.readAllBytes(wrappedKeyFile(variant).toPath());
    }
}
