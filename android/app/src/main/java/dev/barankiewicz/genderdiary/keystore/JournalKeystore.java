package dev.barankiewicz.genderdiary.keystore;

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
 * Where the Journal's data key lives on Android (ticket 13, ADR-0018).
 *
 * <p>The key itself is 32 random bytes, the same key the web mints and wraps
 * under a passphrase. Here it is wrapped by a key pair that Android Keystore
 * generated and will not hand out: the private half never leaves the
 * platform's keystore, and it is bound to the device's lock screen, so it
 * cannot be used until Android says somebody authenticated. A copy of the
 * app's files therefore yields the wrapped blob and nothing that opens it,
 * which is the claim ADR-0018 makes and {@code AndroidEncryptionClaimTest}
 * proves by reading the bytes.
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
 * is destroyed by the platform when that lock screen is removed. There is no
 * recovery: the wrapped blob outlives the key that opens it. That is the
 * Android shape of ADR-0018's "forgotten credentials have no data-preserving
 * recovery", it is reported as its own state rather than as a failed finger
 * (BiometricOutcomes.KEY_INVALIDATED), and the copy that tells people to keep
 * a screen lock and export Archives is the mitigation.
 */
public final class JournalKeystore {

    /** The Keystore entry. Named for the app, since the keystore is shared. */
    private static final String ALIAS = "gender-diary-journal-key";

    /** The wrapped data key, in app-private storage beside the database. */
    private static final String WRAPPED_KEY_FILE = "journal-key.wrapped";

    /** ADR-0018's data key: 32 bytes, handed to SQLCipher raw. */
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

    /** True when this device already holds a Journal key. Both halves are
        required: a keystore entry with no wrapped blob opens nothing, and a
        blob with no entry is what a removed lock screen leaves behind. */
    public boolean hasKey() throws Exception {
        return keystoreEntryExists() && wrappedKeyFile().exists();
    }

    /**
     * First run: mints a data key, wraps it under a freshly generated
     * Keystore pair and writes the blob. Returns the data key, which is the
     * only time it exists outside the wrap - the caller hands it to SQLCipher
     * and keeps it in memory.
     *
     * <p>No authentication: the public half needs none, and the person is
     * already here.
     */
    public byte[] create() throws Exception {
        /* Any half-made state from an interrupted earlier attempt goes first.
           A pair without a blob, or a blob under a pair that was replaced,
           would both read as "hasKey" later and unwrap to nothing. */
        erase();

        PublicKey wrappingKey = generateKeyPair();
        byte[] dataKey = new byte[DATA_KEY_BYTES];
        new SecureRandom().nextBytes(dataKey);

        Cipher cipher = Cipher.getInstance(TRANSFORMATION);
        cipher.init(Cipher.ENCRYPT_MODE, wrappingKey, oaepParameters());
        writeWrappedKey(cipher.doFinal(dataKey));

        return dataKey;
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
        Cipher cipher = Cipher.getInstance(TRANSFORMATION);
        cipher.init(Cipher.DECRYPT_MODE, privateKey(), oaepParameters());
        return cipher;
    }

    /** Runs the unwrap, once the cipher is authorized. */
    public byte[] unwrap(Cipher cipher) throws Exception {
        return cipher.doFinal(readWrappedKey());
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
     *
     * <p>Exposed for {@code JournalKeystoreTest}, which cannot assert that the
     * key is unusable without knowing when a window it did not open has shut:
     * setting a lock screen is itself an authentication, so a test that makes
     * a device secure and immediately reaches for the key is inside a window
     * it created.
     */
    public static int authorizationWindowSeconds() {
        return authorizesTheCipherItself() ? 0 : AUTH_VALIDITY_SECONDS;
    }

    /**
     * The reset path (ADR-0014): the wrapped key goes with the Journal.
     *
     * <p>Both halves, and the blob first. A blob left behind after the entry
     * went is the one order that could survive as an unopenable Journal key;
     * an entry left behind without a blob is inert and the next {@link
     * #create()} replaces it.
     */
    public void erase() throws Exception {
        File wrapped = wrappedKeyFile();
        if (wrapped.exists() && !wrapped.delete()) {
            throw new IOException("could not delete " + wrapped);
        }
        KeyStore keystore = loadKeystore();
        if (keystore.containsAlias(ALIAS)) keystore.deleteEntry(ALIAS);
    }

    /* --- the parts above, in Keystore terms -------------------------------- */

    /* setUserAuthenticationValidityDurationSeconds is deprecated in favour of
       setUserAuthenticationParameters, which is API 30 and above - so the
       deprecated call is the only one there is below 30, and the branch that
       chooses between them is right here. */
    @SuppressWarnings("deprecation")
    private PublicKey generateKeyPair() throws Exception {
        KeyGenParameterSpec.Builder spec =
            new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setKeySize(2048)
                .setDigests(KeyProperties.DIGEST_SHA256)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_RSA_OAEP)
                .setUserAuthenticationRequired(true);

        /* A newly enrolled fingerprint does not destroy the Journal. The
           threat that setting guards against is somebody adding their own
           finger to a phone they took, and the lock screen they would need
           in order to do that is the same one that authorizes the key - so
           it buys nothing here and costs a Journal. */
        spec.setInvalidatedByBiometricEnrollment(false);

        if (authorizesTheCipherItself()) {
            // 0 seconds: authorization does not outlive the operation it was
            // granted for, and the operation is the one in the CryptoObject.
            spec.setUserAuthenticationParameters(
                0, KeyProperties.AUTH_BIOMETRIC_STRONG | KeyProperties.AUTH_DEVICE_CREDENTIAL);
        } else {
            spec.setUserAuthenticationValidityDurationSeconds(AUTH_VALIDITY_SECONDS);
        }

        KeyPairGenerator generator = KeyPairGenerator.getInstance(KeyProperties.KEY_ALGORITHM_RSA, KEYSTORE);
        generator.initialize(spec.build());
        return generator.generateKeyPair().getPublic();
    }

    private PrivateKey privateKey() throws Exception {
        PrivateKey key = (PrivateKey) loadKeystore().getKey(ALIAS, null);
        if (key == null) throw new IllegalStateException("there is no Journal key in the keystore");
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

    private boolean keystoreEntryExists() throws Exception {
        return loadKeystore().containsAlias(ALIAS);
    }

    private static KeyStore loadKeystore() throws Exception {
        KeyStore keystore = KeyStore.getInstance(KEYSTORE);
        keystore.load(null);
        return keystore;
    }

    /* --- the blob ---------------------------------------------------------- */

    /** Exposed so the claim test can read the bytes a thief would read. */
    public File wrappedKeyFile() {
        return new File(context.getFilesDir(), WRAPPED_KEY_FILE);
    }

    private void writeWrappedKey(byte[] wrapped) throws IOException {
        File file = wrappedKeyFile();
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

    private byte[] readWrappedKey() throws IOException {
        return Files.readAllBytes(wrappedKeyFile().toPath());
    }
}
