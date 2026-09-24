package dev.engender.app.photos;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import android.content.Context;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import org.junit.After;
import org.junit.Test;
import org.junit.runner.RunWith;

import java.io.File;
import java.io.FileOutputStream;

/**
 * The reset's photo half (ux-carpet 214). On the Pixel a fill left 215
 * files in {@code files/photos}, and all 215 were still there after
 * "Delete everything and start over" and the next cold boot.
 */
@RunWith(AndroidJUnit4.class)
public class PhotoDirectoryWipeTest {

    private static final String DIRECTORY = "wipe-test-photos";

    private static Context context() {
        return InstrumentationRegistry.getInstrumentation().getTargetContext();
    }

    private static File directory() {
        return new File(context().getFilesDir(), DIRECTORY);
    }

    @After
    public void clear() throws Exception {
        PhotoFiles.deleteDirectory(context(), DIRECTORY);
    }

    @Test
    public void theWipeTakesEveryFileAndTheDirectory() throws Exception {
        for (int i = 0; i < 5; i++) {
            try (FileOutputStream out = new FileOutputStream(PhotoFiles.fileFor(context(), DIRECTORY, "photo-" + i))) {
                out.write(new byte[] {1, 2, 3});
            }
        }
        assertTrue(new File(directory(), ".nomedia").exists());

        PhotoFiles.deleteDirectory(context(), DIRECTORY);

        assertFalse("the directory survived the wipe", directory().exists());
    }

    @Test
    public void aDirectoryThatWasNeverMadeIsNotAFailure() throws Exception {
        assertFalse(directory().exists());
        PhotoFiles.deleteDirectory(context(), DIRECTORY);
    }

    @Test(expected = IllegalArgumentException.class)
    public void aNameThatLeavesTheFilesDirectoryIsRefused() throws Exception {
        PhotoFiles.deleteDirectory(context(), "../databases");
    }
}
