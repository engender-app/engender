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
 * count only when the database's own volume is out of space.
 */
final class SqliteFailure {
    static final String STORAGE_FULL = "storage-full";
    /** Below this a volume cannot take a rollback journal for a single page. */
    static final long NEARLY_FULL_BYTES = 1024 * 1024;

    private SqliteFailure() {}

    static String storageCode(String message, long availableBytes) {
        if (message == null) return null;
        if (message.contains("SQLITE_FULL") || message.contains("database or disk is full")) return STORAGE_FULL;
        boolean couldBeSpace = message.contains("unable to open database file") || message.contains("SQLITE_CANTOPEN")
            || message.contains("disk I/O error") || message.contains("SQLITE_IOERR");
        return couldBeSpace && availableBytes < NEARLY_FULL_BYTES ? STORAGE_FULL : null;
    }
}
