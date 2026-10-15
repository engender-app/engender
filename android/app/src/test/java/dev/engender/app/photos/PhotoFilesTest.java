package dev.engender.app.photos;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertThrows;

import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

import java.io.File;
import java.nio.file.Files;

public class PhotoFilesTest {
    @Rule public TemporaryFolder folder = new TemporaryFolder();

    @Test
    public void aWholeWriteLandsItsBytes() throws Exception {
        File target = new File(folder.getRoot(), "a.jpg");
        PhotoFiles.writeWhole(target, new byte[] { 1, 2, 3 });
        assertArrayEquals(new byte[] { 1, 2, 3 }, Files.readAllBytes(target.toPath()));
    }

    /* Opening the stream creates the file before a byte lands, so a write the
       disk refused (ENOSPC) used to leave a 0-byte photo behind for the boot
       sweep, and a sweep never runs on a boot that writes (last-audit ui 37).
       A null payload fails at the same point a full disk does: after the open,
       inside the write. */
    @Test
    public void aFailedWriteLeavesNoFileUnderItsName() {
        File target = new File(folder.getRoot(), "b.jpg");
        assertThrows(NullPointerException.class, () -> PhotoFiles.writeWhole(target, null));
        assertFalse(target.exists());
    }
}
