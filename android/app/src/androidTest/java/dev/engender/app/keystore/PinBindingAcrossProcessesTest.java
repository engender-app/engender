package dev.engender.app.keystore;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import android.content.Context;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import org.junit.FixMethodOrder;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.junit.runners.MethodSorters;

import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;

/**
 * That the secret outlives the process, and the reboot, and that neither is a
 * question the JVM tier or a single test method can answer (ticket
 * sec-02-06's first acceptance box).
 *
 * <p>The two steps below hand a value to each other through a file, so they
 * can be driven as two separate {@code am instrument} invocations - two
 * processes - or with a reboot in between:
 *
 * <pre>
 * adb -s emulator-5554 shell am instrument -w \
 *   -e class ...PinBindingAcrossProcessesTest#step1MintAndRecordTheSecret \
 *   dev.engender.app.test/androidx.test.runner.AndroidJUnitRunner
 * adb -s emulator-5554 reboot            # or nothing, for a process death alone
 * adb -s emulator-5554 shell am instrument -w \
 *   -e class ...PinBindingAcrossProcessesTest#step2TheSecretIsStillTheSame \
 *   dev.engender.app.test/androidx.test.runner.AndroidJUnitRunner
 * </pre>
 *
 * <p>Run as a class instead - which is what the suite does - the two steps
 * share one process, and then this is a weaker check that says the same thing
 * about the alias rather than about process boundaries. The name ordering is
 * fixed so that it is at least the right way round there.
 *
 * <p>The recorded secret is written to the app's own files directory, which is
 * exactly where it must never be in earnest. It is a test artefact for one
 * comparison and step 2 deletes it along with the key.
 */
@RunWith(AndroidJUnit4.class)
@FixMethodOrder(MethodSorters.NAME_ASCENDING)
public class PinBindingAcrossProcessesTest {

    /** The label the web module signs, spelled out for the reason
        PinBindingKeystoreTest states. */
    private static final String LABEL = "engender/pin-binding/v1";

    private static final String RECORD = "pin-binding-probe";

    private static Context context() {
        return InstrumentationRegistry.getInstrumentation().getTargetContext();
    }

    private static File record() {
        return new File(context().getFilesDir(), RECORD);
    }

    @Test
    public void step1MintAndRecordTheSecret() throws Exception {
        PinBindingKeystore.erase();
        String minted = PinBindingKeystore.create(LABEL);
        assertNotNull(minted);

        Files.write(record().toPath(), minted.getBytes(StandardCharsets.UTF_8));
    }

    @Test
    public void step2TheSecretIsStillTheSame() throws Exception {
        File record = record();
        assertTrue("step 1 has not run on this device", record.exists());
        String minted = new String(Files.readAllBytes(record.toPath()), StandardCharsets.UTF_8);

        try {
            /* The whole claim in one line: whatever happened to the process or
               to the device, the key under the alias signs the label to the
               same value, so the PIN that opened the journal still opens it. */
            assertEquals("the binding secret changed", minted, PinBindingKeystore.read(LABEL));
        } finally {
            Files.deleteIfExists(record.toPath());
            PinBindingKeystore.erase();
        }
    }
}
