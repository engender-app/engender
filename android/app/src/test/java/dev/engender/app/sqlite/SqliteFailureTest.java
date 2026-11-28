package dev.engender.app.sqlite;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

import org.junit.Test;

public class SqliteFailureTest {
    private static final long FULL = 0;
    private static final long ROOMY = 5L * 1024 * 1024 * 1024;

    @Test public void sqliteFullIsAFullDiskWhateverTheVolumeSays() {
        assertEquals("storage-full", SqliteFailure.storageCode("database or disk is full (code 13 SQLITE_FULL)", ROOMY));
    }

    /* On the API 35 emulator with /data full, the first save after the disk
       filled failed with "unable to open database file (code 14)": SQLite
       could not create its rollback journal. Later saves said SQLITE_FULL.
       The same code 14 means a missing directory or a permission problem
       on a roomy disk, so it is a full disk only when the volume says so. */
    @Test public void cantOpenAndIoErrorsAreAFullDiskOnlyOnAFullVolume() {
        assertEquals("storage-full", SqliteFailure.storageCode("unable to open database file (code 14)", FULL));
        assertEquals("storage-full", SqliteFailure.storageCode("disk I/O error (code 10)", 16 * 1024));
        assertNull(SqliteFailure.storageCode("unable to open database file (code 14)", ROOMY));
        // A volume with a little room left is not full: code 14 there has another cause.
        assertNull(SqliteFailure.storageCode("unable to open database file (code 14)", 512 * 1024));
        assertNull(SqliteFailure.storageCode("disk I/O error (code 10)", ROOMY));
    }

    @Test public void otherFailuresKeepNoCodeEvenOnAFullVolume() {
        assertNull(SqliteFailure.storageCode("UNIQUE constraint failed: entry.uuid (code 2067 SQLITE_CONSTRAINT_UNIQUE)", FULL));
        assertNull(SqliteFailure.storageCode("file is not a database (code 26)", FULL));
        assertNull(SqliteFailure.storageCode(null, FULL));
    }
}
