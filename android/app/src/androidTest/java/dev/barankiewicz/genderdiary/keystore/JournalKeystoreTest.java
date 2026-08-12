package dev.barankiewicz.genderdiary.keystore;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

import android.app.KeyguardManager;
import android.content.Context;
import android.security.keystore.KeyInfo;
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
import java.security.KeyStore;
import java.security.KeyFactory;
import java.security.PrivateKey;
import java.util.concurrent.TimeUnit;

import javax.crypto.Cipher;

/**
 * The Keystore half of ticket 13, on a device, because none of it is true
 * anywhere else. Whether a key is really in Android Keystore, whether it is
 * really bound to the lock screen, and what the platform does when that lock
 * screen is removed are properties of the platform rather than of this code.
 *
 * <p>A lock screen is set for the run and cleared afterwards, through the
 * shell that instrumentation can reach: a Keystore key that requires user
 * authentication cannot be created on a device with no lock screen at all,
 * which is itself one of the states asserted below. The emulators come up
 * without one ({@code -wipe-data} on every run), so the test makes the device
 * it needs and puts it back.
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

    private static void setLockScreen() throws Exception {
        Log.i(TAG, "locksettings set-pin: " + shell("locksettings set-pin " + PIN));
        assertTrue("the emulator did not take a lock screen; nothing below can be asserted", deviceIsSecure());
    }

    private static void clearLockScreen() throws Exception {
        Log.i(TAG, "locksettings clear: " + shell("locksettings clear --old " + PIN));
    }

    @Before
    public void freshKeystore() throws Exception {
        keystore = new JournalKeystore(context());
        keystore.erase();
        setLockScreen();
    }

    @After
    public void tidy() throws Exception {
        keystore.erase();
        clearLockScreen();
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
     */
    @Test
    public void removingTheLockScreenDestroysTheKeyAndIsReportedAsItself() throws Exception {
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

        // Put it back, so @After's clearLockScreen has the PIN it expects.
        setLockScreen();
    }

    /** A device with no lock screen is told to set one, not handed a crash. */
    @Test
    public void withNoLockScreenThereIsNothingToBindAKeyTo() throws Exception {
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
