package dev.engender.app.sqlite;

/**
 * Whether a SQLite failure was the disk filling up (last-audit ui 37).
 * Capacitor hands JavaScript a rejection's message and code, so a full disk
 * travels as the code {@code storage-full} beside SQLite's own text, which
 * the boot failure screen and the save toasts read.
 *
 * <p>SQLITE_FULL says so itself. A full disk can also reach SQLite as
 * SQLITE_CANTOPEN, when it cannot create its rollback journal, or as
 * SQLITE_IOERR; those codes have other causes on a disk with room, so they
 * count only when the database's own volume has no room left for a page.
 * Android hands over no errno with these exceptions, so an unrelated
 * failure that happens while the volume is that full is still called
 * full. That is the advice the person needs first in any case: nothing
 * else in the app can write either, and once space is free a failure with
 * another cause comes back without the code.
 */
final class SqliteFailure {
    static final String STORAGE_FULL = "storage-full";
    /** Below this a volume cannot take a rollback journal and a page (16 blocks of 4 KiB). */
    static final long NEARLY_FULL_BYTES = 64 * 1024;

    private SqliteFailure() {}

    static String storageCode(String message, long availableBytes) {
        if (message == null) return null;
        if (message.contains("SQLITE_FULL") || message.contains("database or disk is full")) return STORAGE_FULL;
        boolean couldBeSpace = message.contains("unable to open database file") || message.contains("SQLITE_CANTOPEN")
            || message.contains("disk I/O error") || message.contains("SQLITE_IOERR");
        return couldBeSpace && availableBytes < NEARLY_FULL_BYTES ? STORAGE_FULL : null;
    }
}
