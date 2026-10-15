package dev.engender.app.files;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import java.io.IOException;
import java.nio.file.FileSystemException;
import org.junit.Test;

public class StorageFailureTest {
    @Test public void namesTheWaysAFullDiskReachesAWrite() {
        // libcore's write and open, java.nio's copy, and either one wrapped.
        assertTrue(StorageFailure.isOutOfSpace(new IOException("write failed: ENOSPC (No space left on device)")));
        assertTrue(StorageFailure.isOutOfSpace(new FileSystemException("/data/user/0/x/cache/a.pending", null, "No space left on device")));
        assertTrue(StorageFailure.isOutOfSpace(new IllegalStateException("export-staging-failed",
            new IOException("open failed: ENOSPC (No space left on device)"))));
    }

    @Test public void leavesEveryOtherFailureUnnamed() {
        assertFalse(StorageFailure.isOutOfSpace(new IOException("export-aborted")));
        assertFalse(StorageFailure.isOutOfSpace(new IllegalStateException("verification-failed")));
        assertFalse(StorageFailure.isOutOfSpace(new SecurityException("Permission Denial")));
        assertFalse(StorageFailure.isOutOfSpace(new IOException((String) null)));
        assertFalse(StorageFailure.isOutOfSpace(null));
    }

    @Test public void theRejectionCodeSaysWhichStorageRanOut() {
        IOException full = new IOException("write failed: ENOSPC (No space left on device)");
        assertEquals("storage-full", StorageFailure.code(full, StorageFailure.DEVICE_FULL));
        assertEquals("destination-full", StorageFailure.code(full, StorageFailure.DESTINATION_FULL));
        assertNull(StorageFailure.code(new IOException("export-aborted"), StorageFailure.DESTINATION_FULL));
        assertEquals("destination-full", StorageFailure.code(new StorageFailure.DestinationFull(10, 5), StorageFailure.DEVICE_FULL));
    }

    /* The preflight only measures a destination that handed over a regular
       file: that file's own filesystem is where the bytes land. A pipe or a
       socket is a provider streaming somewhere else - a cloud drive - and
       the phone's free space says nothing about it. */
    @Test public void measuresOnlyARegularFileDestination() {
        assertEquals(Long.valueOf(40L * 4096), StorageFailure.availableBytes(true, 40, 4096, 4096));
        assertEquals(Long.valueOf(40L * 1024), StorageFailure.availableBytes(true, 40, 0, 1024));
        assertNull(StorageFailure.availableBytes(false, 40, 4096, 4096));
        assertNull(StorageFailure.availableBytes(true, -1, 4096, 4096));
    }

    @Test public void refusesOnlyWhatIsKnownNotToFit() {
        assertTrue(StorageFailure.refuses(1_000L, 1_001L));
        assertFalse(StorageFailure.refuses(1_001L, 1_001L));
        assertFalse(StorageFailure.refuses(null, 1_000_000_000L));
    }
}
