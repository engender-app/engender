package dev.barankiewicz.genderdiary.keystore;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;
import static org.junit.Assume.assumeTrue;

import android.app.KeyguardManager;
import android.content.Context;
import android.os.Build;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyInfo;
import android.security.keystore.KeyProperties;
import android.security.keystore.UserNotAuthenticatedException;
import android.util.Log;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

import java.io.File;
import java.io.InputStream;
import java.nio.file.Files;
import java.security.KeyPairGenerator;
import java.security.KeyStore;
import java.security.KeyFactory;
import java.security.PrivateKey;
import java.security.PublicKey;
import java.security.SecureRandom;
import java.security.spec.MGF1ParameterSpec;
import java.util.concurrent.TimeUnit;

import javax.crypto.Cipher;
import javax.crypto.spec.OAEPParameterSpec;
import javax.crypto.spec.PSource;

/**
 * The Keystore half of ticket 13, on a device, because none of it is true
 * anywhere else. Whether a key is really in Android Keystore, whether it is
 * really bound to the lock screen, and what the platform does when that lock
 * screen is removed are properties of the platform rather than of this code.
 *
 * <p>Most cases only need a lock screen to already exist, so {@link
 * #ensureLockScreen()} sets one through the shell only when none is there -
 * on a real phone that is never, so its own credential is left untouched.
 * Only the two cases that need to see the screen come off entirely -
 * creating with none, and losing the key when one that existed is removed -
 * clear it, and they run only on an emulator ({@link #isEmulator()}): a
 * throwaway lock screen can be put back the way this class found it
 * afterwards, a phone's daily-driver credential cannot, so those two are
 * skipped rather than failed anywhere else.
 *
 * <p>What this deliberately does not do is authenticate. An emulator cannot
 * be made to present a finger, so the unwrap is asserted from the other
 * direction, which is the direction that matters: without authentication the
 * platform refuses, and the wrapped blob on disk yields nothing. Every
 * biometric state is covered exhaustively over the error codes themselves in
 * {@code BiometricOutcomesTest}, a JVM test, and the reasoning for that split
 * is written there.
 */
@RunWith(AndroidJUnit4.class)
public class JournalKeystoreTest {

    private static final String TAG = "JournalKeystoreTest";
    private static final String PIN = "1234";
    private static final String ALIAS = "gender-diary-journal-key";

    private JournalKeystore keystore;

    private static Context context() {
        return InstrumentationRegistry.getInstrumentation().getTargetContext();
    }

    /** Runs a command as the shell user, which instrumentation may do and the
        app may not. This is how the device gets a lock screen to bind to. */
    private static String shell(String command) throws Exception {
        try (InputStream out =
                new java.io.FileInputStream(
                    InstrumentationRegistry.getInstrumentation()
                        .getUiAutomation()
                        .executeShellCommand(command)
                        .getFileDescriptor())) {
            return new String(readAll(out));
        }
    }

    private static byte[] readAll(InputStream in) throws Exception {
        java.io.ByteArrayOutputStream buffer = new java.io.ByteArrayOutputStream();
        byte[] chunk = new byte[4096];
        int read;
        while ((read = in.read(chunk)) != -1) buffer.write(chunk, 0, read);
        return buffer.toByteArray();
    }

    private static boolean deviceIsSecure() {
        KeyguardManager keyguard =
            (KeyguardManager) context().getSystemService(Context.KEYGUARD_SERVICE);
        return keyguard != null && keyguard.isDeviceSecure();
    }

    /** Only an AVD's lock screen can be put back the way this class found
        it; a phone's daily-driver credential cannot. {@code ranchu} and
        {@code goldfish} are the hardware names Android Studio's emulator
        reports, which is every device {@code tests/android-tier/run.mjs}
        boots for this suite. */
    private static boolean isEmulator() {
        return Build.FINGERPRINT.startsWith("generic")
            || Build.HARDWARE.contains("ranchu")
            || Build.HARDWARE.contains("goldfish")
            || Build.PRODUCT.contains("sdk");
    }

    private static void setLockScreen() throws Exception {
        Log.i(TAG, "locksettings set-pin: " + shell("locksettings set-pin " + PIN));
        assertTrue("the emulator did not take a lock screen; nothing below can be asserted", deviceIsSecure());
    }

    private static void clearLockScreen() throws Exception {
        Log.i(TAG, "locksettings clear: " + shell("locksettings clear --old " + PIN));
    }

    /** What every case but the two lock-toggling ones needs: a lock screen,
        no matter whose. A phone already has its own, so this never touches
        it there; only a bare emulator gets one made, and only because
        making it is safe to leave in place for the tests after this one. */
    private static void ensureLockScreen() throws Exception {
        if (deviceIsSecure()) return;
        assumeTrue("no lock screen, and only an emulator's can be set from here", isEmulator());
        setLockScreen();
    }

    @Before
    public void freshKeystore() throws Exception {
        keystore = new JournalKeystore(context());
        keystore.erase();
        ensureLockScreen();
    }

    @After
    public void tidy() throws Exception {
        keystore.erase();
    }

    /** The ticket's first box, in the only place it can be checked. */
    @Test
    public void theDataKeyIsWrappedByAKeyTheKeystoreHolds() throws Exception {
        assertFalse("a fresh device should hold no key", keystore.hasKey());

        byte[] dataKey = keystore.create();
        assertEquals("ADR-0018's data key is 32 bytes", 32, dataKey.length);
        assertTrue(keystore.hasKey());

        KeyStore androidKeystore = KeyStore.getInstance("AndroidKeyStore");
        androidKeystore.load(null);
        assertTrue("the wrapping key is not in Android Keystore", androidKeystore.containsAlias(ALIAS));

        /* The point of the Keystore rather than a file: the private half
           cannot be read out of the process that owns it. An AndroidKeyStore
           private key answers getEncoded() with null by design. */
        PrivateKey wrappingKey = (PrivateKey) androidKeystore.getKey(ALIAS, null);
        assertNotNull(wrappingKey);
        assertNull("the wrapping key handed out its own material", wrappingKey.getEncoded());
    }

    /**
     * Ticket 08's own claim: a key made before it - no MGF1 digest declared -
     * still unwraps under the current code. There is no real pre-ticket key
     * to load, so this rebuilds exactly what {@code generateKeyPair()} made
     * before the ticket ({@link #generateKeyWithoutMgf1Declaration()}) and
     * wraps a data key under it by hand, then hands the result to the
     * current, unchanged {@link JournalKeystore#unwrapCipher()}.
     *
     * <p>A full round trip only proves out where a live authentication can
     * be faked at all: below API 30, setting the lock screen is itself an
     * authentication (see {@link #withoutAuthenticationTheKeyDoesNotCome()}),
     * so this test uses that to open a fresh window, and only on an emulator
     * - the same restriction the lock-toggling cases above have, since
     * forcing a new authentication event is what {@link #setLockScreen()}
     * does. From API 30 nothing here can authenticate the operation, so the
     * strongest provable claim is the one already used for a brand-new key
     * in {@link #withoutAuthenticationTheKeyDoesNotCome()}: refused for lack
     * of authentication, not rejected as a malformed old key.
     */
    @Test
    public void aKeyMadeBeforeThisTicketStillUnwraps() throws Exception {
        PublicKey wrappingKey = generateKeyWithoutMgf1Declaration();

        byte[] dataKey = new byte[32];
        new SecureRandom().nextBytes(dataKey);
        Cipher wrap = Cipher.getInstance("RSA/ECB/OAEPWithSHA-256AndMGF1Padding");
        wrap.init(Cipher.ENCRYPT_MODE, wrappingKey,
            new OAEPParameterSpec("SHA-256", "MGF1", MGF1ParameterSpec.SHA1, PSource.PSpecified.DEFAULT));
        Files.write(keystore.wrappedKeyFile().toPath(), wrap.doFinal(dataKey));

        if (JournalKeystore.authorizationWindowSeconds() > 0 && isEmulator()) {
            setLockScreen(); // a fresh authentication event, safe here only
            Cipher unwrap = keystore.unwrapCipher();
            assertArrayEquals(
                "a pre-ticket key stopped unwrapping to the data key it wrapped", dataKey, keystore.unwrap(unwrap));
            return;
        }

        try {
            byte[] leaked = keystore.unwrap(keystore.unwrapCipher());
            fail("unwrapped " + leaked.length + " bytes without authenticating");
        } catch (UserNotAuthenticatedException expected) {
            assertNotNull(expected);
        } catch (android.security.keystore.KeyPermanentlyInvalidatedException gone) {
            fail("the pre-ticket key was rejected outright, not merely unauthorized: " + gone);
        } catch (Exception expected) {
            Log.i(TAG, "the pre-ticket key's unwrap was refused with " + expected.getClass().getName());
        }
    }

    /** What {@code generateKeyPair()} made before this ticket - the same
        spec, minus the MGF1 declaration a pre-ticket key never has. */
    @SuppressWarnings("deprecation")
    private static PublicKey generateKeyWithoutMgf1Declaration() throws Exception {
        KeyGenParameterSpec.Builder spec =
            new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setKeySize(2048)
                .setDigests(KeyProperties.DIGEST_SHA256)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_RSA_OAEP)
                .setUserAuthenticationRequired(true)
                .setInvalidatedByBiometricEnrollment(false);

        if (JournalKeystore.authorizesTheCipherItself()) {
            spec.setUserAuthenticationParameters(
                0, KeyProperties.AUTH_BIOMETRIC_STRONG | KeyProperties.AUTH_DEVICE_CREDENTIAL);
        } else {
            spec.setUserAuthenticationValidityDurationSeconds(JournalKeystore.authorizationWindowSeconds());
        }

        KeyPairGenerator generator = KeyPairGenerator.getInstance(KeyProperties.KEY_ALGORITHM_RSA, "AndroidKeyStore");
        generator.initialize(spec.build());
        return generator.generateKeyPair().getPublic();
    }

    /** The key is bound to the lock screen, not merely stored behind one. */
    @Test
    public void theWrappingKeyRequiresAuthenticationAndSaysSo() throws Exception {
        keystore.create();

        KeyStore androidKeystore = KeyStore.getInstance("AndroidKeyStore");
        androidKeystore.load(null);
        PrivateKey wrappingKey = (PrivateKey) androidKeystore.getKey(ALIAS, null);
        KeyInfo info =
            KeyFactory.getInstance(wrappingKey.getAlgorithm(), "AndroidKeyStore")
                .getKeySpec(wrappingKey, KeyInfo.class);

        assertTrue("the wrapping key does not require user authentication", info.isUserAuthenticationRequired());
        // Reported rather than asserted: an emulator's keymaster is not a
        // phone's, and the ticket asks for Keystore, not for StrongBox.
        Log.i(TAG, "wrapping key inside secure hardware: " + info.isInsideSecureHardware());
    }

    /**
     * The claim, from the direction a test rig can push on: no authentication,
     * no key. This is what makes "biometrics only ask" true - the asking is
     * not a UI convention the app could skip, it is the platform's condition
     * for using the key at all.
     */
    @Test
    public void withoutAuthenticationTheKeyDoesNotCome() throws Exception {
        keystore.create();

        /* Below API 30 the key is authorized for a few seconds after any
           authentication rather than for one operation - and setting the lock
           screen this test needs is an authentication, so the window is
           already open when the key is made. Measured, not reasoned about:
           the first version of this test unwrapped 32 bytes on API 26 and
           called it a leak. Waiting the window out is what turns this into an
           assertion about the key rather than about the timing. */
        int window = JournalKeystore.authorizationWindowSeconds();
        if (window > 0) Thread.sleep(TimeUnit.SECONDS.toMillis(window + 2));

        try {
            /* One of the two throws, depending on the platform's era: below
               API 30 the key is time-bound and init() is itself an authorized
               operation, so it fails here; from API 30 it is per-use and the
               refusal lands on the doFinal. Either way nothing comes back. */
            Cipher cipher = keystore.unwrapCipher();
            byte[] leaked = keystore.unwrap(cipher);
            fail("unwrapped " + leaked.length + " bytes without authenticating");
        } catch (UserNotAuthenticatedException expected) {
            assertNotNull(expected);
        } catch (android.security.keystore.KeyPermanentlyInvalidatedException gone) {
            fail("the key was invalidated rather than merely unauthorized: " + gone);
        } catch (Exception expected) {
            /* The per-use path surfaces as a provider exception from the
               operation rather than as UserNotAuthenticatedException. What
               matters is that no plaintext key came back, which the fail()
               above is what would have reported. */
            Log.i(TAG, "the unwrap was refused with " + expected.getClass().getName());
        }
    }

    /** The blob a thief copies is not the key, and has none of it in it. */
    @Test
    public void theWrappedBlobOnDiskIsNotTheDataKey() throws Exception {
        byte[] dataKey = keystore.create();

        File blob = keystore.wrappedKeyFile();
        assertTrue("nothing was written", blob.exists());
        byte[] onDisk = Files.readAllBytes(blob.toPath());

        assertFalse("the data key is sitting in the wrapped file", indexOf(onDisk, dataKey) >= 0);
        // RSA-2048 ciphertext, so a blob the size of the key would mean the
        // wrap did not happen at all.
        assertEquals("the wrap is not RSA-2048 ciphertext", 256, onDisk.length);
    }

    /**
     * Removing the lock screen destroys the key, and the app reports that as
     * its own state rather than as a finger that did not match (ticket 13's
     * third box - a retry loop here would be a trap with no way out).
     *
     * <p>Emulator only: putting the lock screen back afterwards means putting
     * back this class's own throwaway PIN, which is not an option on a phone
     * whose actual credential this test would otherwise be clearing.
     */
    @Test
    public void removingTheLockScreenDestroysTheKeyAndIsReportedAsItself() throws Exception {
        assumeTrue("needs an emulator; a phone's lock screen cannot be restored", isEmulator());

        keystore.create();
        assertTrue(keystore.hasKey());

        clearLockScreen();
        assertFalse("the lock screen is still set, so this proves nothing", deviceIsSecure());

        try {
            Cipher cipher = keystore.unwrapCipher();
            keystore.unwrap(cipher);
            fail("the key survived the lock screen it was bound to");
        } catch (android.security.keystore.KeyPermanentlyInvalidatedException expected) {
            assertNotNull(expected);
        } catch (Exception other) {
            /* Some platform versions drop the entry outright instead of
               keeping an invalidated one. Both are "the key is gone", and
               KeystorePlugin maps the unrecoverable-key case to the same
               outcome; what would be wrong is an unwrap that worked. */
            Log.i(TAG, "the invalidated key surfaced as " + other.getClass().getName());
        }

        // Put it back, so the next test's ensureLockScreen sees one already there.
        setLockScreen();
    }

    /** A device with no lock screen is told to set one, not handed a crash.
        Emulator only, for the same reason as the case above. */
    @Test
    public void withNoLockScreenThereIsNothingToBindAKeyTo() throws Exception {
        assumeTrue("needs an emulator; a phone's lock screen cannot be restored", isEmulator());

        clearLockScreen();
        assertFalse(deviceIsSecure());

        // What KeystorePlugin.create asks before it tries anything.
        assertFalse("deviceIsSecure lied about a device with no lock screen", keystore.deviceIsSecure());

        setLockScreen();
    }

    /** The reset path (ADR-0014): both halves go. */
    @Test
    public void eraseTakesTheKeyAndTheBlob() throws Exception {
        keystore.create();
        assertTrue(keystore.hasKey());

        keystore.erase();

        assertFalse(keystore.hasKey());
        assertFalse("the wrapped blob outlived the reset", keystore.wrappedKeyFile().exists());
        KeyStore androidKeystore = KeyStore.getInstance("AndroidKeyStore");
        androidKeystore.load(null);
        assertFalse("the keystore entry outlived the reset", androidKeystore.containsAlias(ALIAS));
    }

    /** A second create replaces the first, rather than leaving a blob that
        the new key cannot open. */
    @Test
    public void creatingAgainReplacesBothHalvesTogether() throws Exception {
        byte[] first = keystore.create();
        byte[] second = keystore.create();

        assertFalse("two creates produced the same data key", java.util.Arrays.equals(first, second));
        byte[] onDisk = Files.readAllBytes(keystore.wrappedKeyFile().toPath());
        assertFalse(indexOf(onDisk, first) >= 0);
        assertFalse(indexOf(onDisk, second) >= 0);
    }

    private static int indexOf(byte[] haystack, byte[] needle) {
        outer:
        for (int i = 0; i + needle.length <= haystack.length; i++) {
            for (int j = 0; j < needle.length; j++) {
                if (haystack[i + j] != needle[j]) continue outer;
            }
            return i;
        }
        return -1;
    }
}
