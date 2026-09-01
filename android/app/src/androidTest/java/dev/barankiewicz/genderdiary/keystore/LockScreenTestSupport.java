package dev.barankiewicz.genderdiary.keystore;

import static org.junit.Assert.assertTrue;
import static org.junit.Assume.assumeTrue;

import android.app.KeyguardManager;
import android.content.Context;
import android.os.Build;
import android.util.Log;

import androidx.test.platform.app.InstrumentationRegistry;

import java.io.ByteArrayOutputStream;
import java.io.FileInputStream;
import java.io.InputStream;

/**
 * The lock-screen shell plumbing {@code JournalKeystoreTest} and {@code
 * BiometricAuthenticatorAvailabilityTest} both need: neither test is about
 * the lock screen itself, both need one in place to bind a key or an
 * authenticator to, and only an emulator's can be set from a test rig at
 * all - a phone's daily-driver credential is left untouched.
 */
final class LockScreenTestSupport {

    private static final String TAG = "LockScreenTestSupport";
    static final String PIN = "1234";

    private LockScreenTestSupport() {}

    static Context context() {
        return InstrumentationRegistry.getInstrumentation().getTargetContext();
    }

    /** Runs a command as the shell user, which instrumentation may do and the
        app may not. This is how the device gets a lock screen to bind to. */
    static String shell(String command) throws Exception {
        try (InputStream out =
                new FileInputStream(
                    InstrumentationRegistry.getInstrumentation()
                        .getUiAutomation()
                        .executeShellCommand(command)
                        .getFileDescriptor())) {
            return new String(readAll(out));
        }
    }

    private static byte[] readAll(InputStream in) throws Exception {
        ByteArrayOutputStream buffer = new ByteArrayOutputStream();
        byte[] chunk = new byte[4096];
        int read;
        while ((read = in.read(chunk)) != -1) buffer.write(chunk, 0, read);
        return buffer.toByteArray();
    }

    static boolean deviceIsSecure() {
        KeyguardManager keyguard =
            (KeyguardManager) context().getSystemService(Context.KEYGUARD_SERVICE);
        return keyguard != null && keyguard.isDeviceSecure();
    }

    /** Only an AVD's lock screen can be put back the way a test found it; a
        phone's daily-driver credential cannot. {@code ranchu} and {@code
        goldfish} are the hardware names Android Studio's emulator reports,
        which is every device {@code tests/android-tier/run.mjs} boots for
        this suite. */
    static boolean isEmulator() {
        return Build.FINGERPRINT.startsWith("generic")
            || Build.HARDWARE.contains("ranchu")
            || Build.HARDWARE.contains("goldfish")
            || Build.PRODUCT.contains("sdk");
    }

    static void setLockScreen() throws Exception {
        Log.i(TAG, "locksettings set-pin: " + shell("locksettings set-pin " + PIN));
        assertTrue("the emulator did not take a lock screen; nothing below can be asserted", deviceIsSecure());
    }

    static void clearLockScreen() throws Exception {
        Log.i(TAG, "locksettings clear: " + shell("locksettings clear --old " + PIN));
    }

    /** What every case that just needs a lock screen to exist wants,
        regardless of whose it is. A phone already has its own, so this
        never touches it there; only a bare emulator gets one made, and
        only because making it is safe to leave in place afterwards. */
    static void ensureLockScreen() throws Exception {
        if (deviceIsSecure()) return;
        assumeTrue("no lock screen, and only an emulator's can be set from here", isEmulator());
        setLockScreen();
    }
}
