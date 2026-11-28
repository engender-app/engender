package dev.engender.app.photos;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
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

    /* Opening the stream creates the file before a byte lands, so a write the disk refused
       (ENOSPC) used to leave a 0-byte photo behind for the boot sweep, and a sweep never
       runs on a boot that writes. A null payload fails at the same point a full disk does:
       after the open, inside the write. */
    @Test
    public void aFailedWriteLeavesNoFileUnderItsName() {
        File target = new File(folder.getRoot(), "b.jpg");
        assertThrows(NullPointerException.class, () -> PhotoFiles.writeWhole(target, null));
        assertFalse(target.exists());
    }

    @Test
    public void aNameIsItsOwnTrimOrItIsRefused() {
        assertTrue(PhotoFiles.isCanonicalName("6f1c2a9e-0b1d-4c3e-8f7a-123456789abc.jpg"));
        assertTrue(PhotoFiles.isCanonicalName("6f1c2a9e-0b1d-4c3e-8f7a-123456789abc-thumb.jpg"));
        assertTrue(PhotoFiles.isCanonicalName("6f1c2a9e-0b1d-4c3e-8f7a-123456789abc.webm"));
        for (String name : new String[] { "", " ", "x.jpg ", " x.jpg", "x.jpg\n", "x.jpg\u0001", ".", ".nomedia", "a/b.jpg", "a\\b.jpg", "a..jpg" }) {
            assertFalse(name, PhotoFiles.isCanonicalName(name));
        }
    }
}
