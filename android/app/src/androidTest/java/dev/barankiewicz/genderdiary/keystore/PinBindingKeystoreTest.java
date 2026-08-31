package dev.barankiewicz.genderdiary.keystore;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import android.security.keystore.KeyInfo;
import android.util.Log;

import androidx.test.ext.junit.runners.AndroidJUnit4;

import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

import java.security.KeyStore;

import javax.crypto.SecretKey;
import javax.crypto.SecretKeyFactory;

/**
 * PIN mode's binding key on a device, because none of what the ticket claims
 * is true anywhere else (phase 5 security ticket sec-02-06).
 *
 * <p>Whether a key is really in Android Keystore, whether the platform really
 * refuses to hand out its material, and whether it really needs no
 * authentication are properties of the platform rather than of {@link
 * PinBindingKeystore}. The JVM tier cannot answer any of them: there is no
 * AndroidKeyStore provider there.
 *
 * <p><b>What "survives a process death" means here, and why this is the
 * honest proof of it.</b> Nothing about this key is held in the app's
 * process: {@link PinBindingKeystore} is static, keeps no field, and opens a
 * fresh {@code KeyStore} handle on every call. So a signature produced after
 * the process comes back is the same operation as a signature produced by the
 * next call in this test - the key is fetched from the platform either way.
 * What a restart could break is persistence of the alias, and that is what
 * the assertions below turn on: the key is only ever minted once, in {@link
 * #before()}, and every later read goes back to the keystore for it.
 *
 * <p>No lock screen is set for this run, unlike {@code JournalKeystoreTest}.
 * That is the point of the key rather than an omission: a person typing their
 * PIN must not meet a second gate in front of it, so the key is minted and
 * used with nothing enrolled and no prompt anywhere.
 */
@RunWith(AndroidJUnit4.class)
public class PinBindingKeystoreTest {

    private static final String TAG = "PinBindingKeystoreTest";

    /** The label the web module signs. Spelled out rather than imported,
        because a test that reads the same constant as the code cannot notice
        it changing - and a changed label is every PIN journal on the device
        refusing a correct PIN. */
    private static final String LABEL = "gender-diary/pin-binding/v1";

    @Before
    public void before() throws Exception {
        PinBindingKeystore.erase();
    }

    @After
    public void tidy() throws Exception {
        PinBindingKeystore.erase();
    }

    /** The one the whole ticket is for. */
    @Test
    public void theSecretIsStableAndTheKeyBehindItStaysInTheKeystore() throws Exception {
        assertNull("a device with no PIN journal should hold no binding key", PinBindingKeystore.read(LABEL));

        String minted = PinBindingKeystore.create(LABEL);
        assertNotNull(minted);
        assertFalse(minted.isEmpty());

        /* Every later unlock, including the ones after a restart: the key is
           fetched from the platform each time, so these are the same
           operation a cold start performs. */
        assertEquals("the same key signed the same label to a different value", minted, PinBindingKeystore.read(LABEL));
        assertEquals(minted, PinBindingKeystore.read(LABEL));

        KeyStore keystore = KeyStore.getInstance("AndroidKeyStore");
        keystore.load(null);
        assertTrue("the binding key is not in Android Keystore", keystore.containsAlias(PinBindingKeystore.ALIAS));

        /* The property that makes a copy of the app's directory useless: the
           platform will not give up the key's material, to this app or to
           anything reading its files. An AndroidKeyStore secret key answers
           getEncoded() with null by design. */
        SecretKey key = (SecretKey) keystore.getKey(PinBindingKeystore.ALIAS, null);
        assertNotNull(key);
        assertNull("the binding key handed out its own material", key.getEncoded());
    }

    /**
     * The deliberate absence of a second gate. A key that required
     * authentication would throw here instead of signing, on a device with no
     * lock screen at all - and would put a biometric prompt in front of the
     * PIN pad on one that has it.
     */
    @Test
    public void theKeyAsksForNoAuthenticationOfItsOwn() throws Exception {
        PinBindingKeystore.create(LABEL);

        KeyStore keystore = KeyStore.getInstance("AndroidKeyStore");
        keystore.load(null);
        SecretKey key = (SecretKey) keystore.getKey(PinBindingKeystore.ALIAS, null);
        KeyInfo info =
            (KeyInfo)
                SecretKeyFactory.getInstance(key.getAlgorithm(), "AndroidKeyStore")
                    .getKeySpec(key, KeyInfo.class);

        assertFalse("the binding key asks for authentication of its own", info.isUserAuthenticationRequired());
        // Reported rather than asserted: Keystore puts an HMAC key in the TEE
        // where the device's keymaster implements it, and an emulator's does
        // not. The ticket needs the key outside the app's files, which the
        // assertions above are what prove.
        Log.i(TAG, "binding key inside secure hardware: " + info.isInsideSecureHardware());
    }

    /** The reset (ADR-0014), and a move out of PIN mode: the alias goes, and
        what it produced is not reachable afterwards. */
    @Test
    public void erasingTakesTheAliasAndTheSecretWithIt() throws Exception {
        PinBindingKeystore.create(LABEL);

        PinBindingKeystore.erase();

        KeyStore keystore = KeyStore.getInstance("AndroidKeyStore");
        keystore.load(null);
        assertFalse("the reset left the binding alias behind", keystore.containsAlias(PinBindingKeystore.ALIAS));
        assertNull("a reset device still produced a binding secret", PinBindingKeystore.read(LABEL));
    }

    /** Erasing what is not there is what a reset on a passphrase journal
        does, and it must not throw at the reset. */
    @Test
    public void erasingNothingIsNotAFailure() throws Exception {
        PinBindingKeystore.erase();
        PinBindingKeystore.erase();
    }

    /**
     * Minting replaces the key. An abandoned setup attempt must not leave
     * behind a key that opens the keystore the next attempt writes.
     */
    @Test
    public void mintingAgainReplacesTheKey() throws Exception {
        String abandoned = PinBindingKeystore.create(LABEL);

        assertNotEquals(abandoned, PinBindingKeystore.create(LABEL));
    }

    /**
     * The label is versioned so that a later scheme can derive a different
     * secret from the same key. That only holds if the label actually reaches
     * the signature.
     */
    @Test
    public void aDifferentLabelIsADifferentSecret() throws Exception {
        String v1 = PinBindingKeystore.create(LABEL);

        assertNotEquals(v1, PinBindingKeystore.read("gender-diary/pin-binding/v2"));
        assertEquals(v1, PinBindingKeystore.read(LABEL));
    }

    /** Base64 with no wrapping: the value is joined to the PIN and fed to a
        KDF as one string, so a newline in the middle of it would be part of
        the secret until something normalized it away. */
    @Test
    public void theSecretIsOneLineOfBase64() throws Exception {
        String secret = PinBindingKeystore.create(LABEL);

        assertFalse("the secret carries a line break", secret.contains("\n"));
        assertTrue("an HMAC-SHA256 signature is 32 bytes, 44 base64 characters", secret.length() == 44);
    }
}
