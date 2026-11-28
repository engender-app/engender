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
 * Check the binding key across separate instrumentation processes.
 * Use a disposable emulator and optionally reboot between steps.
 *
 * <pre>
 * adb -s emulator-5554 shell am instrument -w \
 *   -e class ...PinBindingAcrossProcessesTest#step1MintAndRecordTheSecret \
 *   dev.engender.app.test/androidx.test.runner.AndroidJUnitRunner
 * adb -s emulator-5554 reboot
 * adb -s emulator-5554 shell am instrument -w \
 *   -e class ...PinBindingAcrossProcessesTest#step2TheSecretIsStillTheSame \
 *   dev.engender.app.test/androidx.test.runner.AndroidJUnitRunner
 * </pre>
 *
 * <p>The suite runs ordered methods in one process and checks alias
 * persistence there. Only this test writes the comparison secret to
 * app storage. Step 2 deletes it and the test key.
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
