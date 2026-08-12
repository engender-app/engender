package dev.barankiewicz.genderdiary.sqlite;

import android.content.Context;
import android.database.Cursor;

import com.getcapacitor.JSObject;

import net.zetetic.database.sqlcipher.SQLiteDatabase;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;

/**
 * One SQLCipher database and the type mapping between it and the bridge.
 *
 * <p>Two deliberate omissions. There is no write-ahead log: AOSP's
 * SQLiteDatabase, which sqlcipher-android forks, keeps a connection pool of
 * one while WAL is off and grows it when WAL is on, and a pool would put a
 * {@code BEGIN} on one connection and the statements it is meant to wrap on
 * another. The web driver gets the same property from its worker serializing
 * everything onto one connection, and the migration runner's callback
 * composition depends on it in both places.
 *
 * <p>And there is no key derivation. A hex key arrives already stretched or
 * already random (ADR-0013, ADR-0018) and is handed to SQLCipher in its raw
 * key form, which is the whole reason this bridge exists instead of
 * {@code @capacitor-community/sqlite} (ADR-0020, ticket 11 amendment).
 */
final class SqliteConnection {

    /** ADR-0006's copy, taken before a migration and removed after it. The
        suffix matches the web tier's (web-ports.ts): one artifact of one ADR
        should not be findable under two different names depending on which
        platform wrote it. */
    private static final String PRE_MIGRATION_SUFFIX = ".pre-migration-backup";

    enum TransactionStep {
        BEGIN("BEGIN"),
        COMMIT("COMMIT"),
        ROLLBACK("ROLLBACK");

        private final String sql;

        TransactionStep(String sql) {
            this.sql = sql;
        }
    }

    private SQLiteDatabase database;
    private File databaseFile;
    /** Kept so the pre-migration copy can be opened under the same key it was
        written with - a copy that will not open is not a recovery point. */
    private String password = "";

    static void loadNativeLibrary() {
        System.loadLibrary("sqlcipher");
    }

    void open(Context context, String name, String hexKey) {
        close();
        databaseFile = context.getDatabasePath(name);
        File parent = databaseFile.getParentFile();
        if (parent != null) parent.mkdirs();
        password = rawKeyPassword(hexKey);
        database = SQLiteDatabase.openOrCreateDatabase(databaseFile, password, null, null, null);
    }

    /**
     * SQLCipher reads {@code x'<hex>'} as a raw key and runs no KDF over it.
     * An absent key opens a plain, unencrypted database - which is where
     * ticket 11 leaves the app, since the Keystore that produces the real key
     * is ticket 13.
     */
    private static String rawKeyPassword(String hexKey) {
        if (hexKey == null || hexKey.isEmpty()) return "";
        if (!hexKey.matches("(?i)[0-9a-f]{64}")) {
            throw new IllegalArgumentException("hexKey must be 64 hex characters (a 32-byte raw key)");
        }
        return "x'" + hexKey + "'";
    }

    /**
     * Whether a database file on disk is an unencrypted one, asked without
     * opening it (ticket 13).
     *
     * <p>Every SQLite file begins with the same 16-byte string; an encrypted
     * one begins with its own salt, so the header is the question. Asked
     * before the driver opens anything, because opening a plaintext journal
     * with a raw key fails as {@code SQLITE_NOTADB} - which is indistinguishable
     * from a corrupt file, and reads to a person as "your journal is broken"
     * when what is true is "this build will not open it".
     */
    static boolean isPlaintextDatabase(Context context, String name) throws IOException {
        File file = context.getDatabasePath(name);
        if (!file.exists()) return false;
        byte[] header = new byte[SQLITE_MAGIC.length];
        try (java.io.FileInputStream in = new java.io.FileInputStream(file)) {
            if (in.read(header) != header.length) return false;
        }
        return java.util.Arrays.equals(header, SQLITE_MAGIC);
    }

    private static final byte[] SQLITE_MAGIC = "SQLite format 3\0".getBytes(java.nio.charset.StandardCharsets.US_ASCII);

    void exec(String sql) {
        SQLiteDatabase db = requireOpen();
        for (String statement : SqlStatements.split(sql)) {
            db.execSQL(statement);
        }
    }

    JSONArray query(String sql, JSONArray params) throws JSONException {
        SQLiteDatabase db = requireOpen();
        JSONArray rows = new JSONArray();
        try (Cursor cursor = db.rawQuery(sql, bindArgs(params))) {
            int columns = cursor.getColumnCount();
            while (cursor.moveToNext()) {
                JSONObject row = new JSONObject();
                for (int i = 0; i < columns; i++) {
                    row.put(cursor.getColumnName(i), value(cursor, i));
                }
                rows.put(row);
            }
        }
        return rows;
    }

    JSObject run(String sql, JSONArray params) throws JSONException {
        SQLiteDatabase db = requireOpen();
        db.execSQL(sql, bindArgs(params));

        /* changes() and last_insert_rowid() are per-connection and unaffected
           by the SELECT that reads them, so one round trip after the write
           reports both truthfully. The journal reads its rowids back by uuid
           (ADR-0002) and does not depend on lastInsertRowid, but the contract
           says both are honest and the browser tier already asserts it. */
        JSObject result = new JSObject();
        try (Cursor cursor = db.rawQuery("SELECT changes() AS c, last_insert_rowid() AS r", null)) {
            cursor.moveToFirst();
            result.put("changes", cursor.getLong(0));
            result.put("lastInsertRowid", cursor.getLong(1));
        }
        return result;
    }

    int getUserVersion() {
        try (Cursor cursor = requireOpen().rawQuery("PRAGMA user_version", null)) {
            cursor.moveToFirst();
            return cursor.getInt(0);
        }
    }

    void setUserVersion(int version) {
        // PRAGMA takes no bound parameter; versions come from the migrations
        // array in this codebase, never from anything a user typed.
        requireOpen().execSQL("PRAGMA user_version = " + version);
    }

    void transactionStep(TransactionStep step) {
        requireOpen().execSQL(step.sql);
    }

    /**
     * Copies the database beside itself before a migration runs. Nothing
     * restores it yet - ADR-0006 keeps the copy so a failed migration leaves
     * something to recover from, and the copy is what makes that possible.
     */
    void copyDatabaseFile() throws IOException {
        File source = requireFile();
        if (!source.exists()) return; // nothing migrated yet, nothing to copy
        Files.copy(source.toPath(), preMigrationCopy().toPath(), StandardCopyOption.REPLACE_EXISTING);
    }

    /**
     * Whether the copy is on disk <em>and</em> holds a journal. Both halves
     * matter for the same reason they do on the web: a copy nobody can read
     * is not a recovery point, and the failure screen must not offer a
     * restore it cannot perform.
     */
    boolean preMigrationCopyIsUsable() {
        if (databaseFile == null) return false;
        File copy = preMigrationCopy();
        if (!copy.exists() || copy.length() == 0) return false;
        try (SQLiteDatabase check =
                SQLiteDatabase.openDatabase(
                    copy.getPath(), password, null, SQLiteDatabase.OPEN_READONLY, null, null);
             Cursor cursor =
                check.rawQuery("SELECT count(*) FROM sqlite_master WHERE type = 'table'", null)) {
            cursor.moveToFirst();
            return cursor.getLong(0) > 0;
        } catch (Exception unreadable) {
            // Wrong key, or not a database. Either way there is nothing to go back to.
            return false;
        }
    }

    /**
     * Puts the copy back as the live database, after a migration that could
     * not be finished (ticket 04, ADR-0006).
     *
     * <p>A file copy rather than the web tier's VACUUM INTO, because these are
     * ordinary files rather than an opaque OPFS pool. The connection is closed
     * first for the same reason it is there: it is holding the file about to
     * be replaced. The copy stays afterwards - it is still the only insurance,
     * and ADR-0006 retires it at the next clean boot.
     */
    void restorePreMigrationCopy() throws IOException {
        File copy = preMigrationCopy();
        if (!copy.exists()) throw new IOException("there is no pre-migration copy to restore");
        if (!preMigrationCopyIsUsable()) {
            // Checked before anything is deleted, so a copy that cannot be
            // opened leaves the database it was going to replace on disk.
            throw new IOException("the pre-migration copy cannot be opened; it is not a recovery point");
        }

        close();
        File live = requireFile();
        for (String suffix : new String[] {"-wal", "-shm", "-journal"}) {
            File side = new File(live.getPath() + suffix);
            if (side.exists()) side.delete();
        }
        Files.copy(copy.toPath(), live.toPath(), StandardCopyOption.REPLACE_EXISTING);
    }

    void cleanupPreMigrationCopy() {
        if (databaseFile == null) return;
        File copy = preMigrationCopy();
        if (copy.exists()) copy.delete();
    }

    void close() {
        if (database != null) {
            database.close();
            database = null;
        }
    }

    /**
     * The reset path's half of the wipe on Android (ticket 13, ADR-0014).
     *
     * <p>Everything the web's reset gets for free by emptying the OPFS root:
     * the database, its side files and ADR-0006's copy, all of which live in
     * app-private storage here rather than in the WebView's storage. Without
     * this a reset would erase the Keystore key and leave the ciphertext, and
     * the next boot would mint a fresh key and meet a database it cannot open.
     *
     * <p>The connection goes first, because a file with an open handle on it
     * deletes on some filesystems and not on others, and a reset that half
     * worked is worse than one that failed.
     */
    void deleteDatabaseFiles() throws IOException {
        close();
        if (databaseFile == null) return;
        for (String suffix : new String[] {"", "-wal", "-shm", "-journal", PRE_MIGRATION_SUFFIX}) {
            File file = new File(databaseFile.getPath() + suffix);
            if (file.exists() && !file.delete()) throw new IOException("could not delete " + file);
        }
    }

    private File preMigrationCopy() {
        return new File(requireFile().getPath() + PRE_MIGRATION_SUFFIX);
    }

    private File requireFile() {
        if (databaseFile == null) throw new IllegalStateException("the database is not open");
        return databaseFile;
    }

    private SQLiteDatabase requireOpen() {
        if (database == null) throw new IllegalStateException("the database is not open");
        return database;
    }

    /**
     * JSON has one number type and so does JavaScript, so an integral value
     * binds as INTEGER and everything else as REAL - the same rule node:sqlite
     * applies in the test tier, which is what keeps the tiers comparable.
     *
     * <p>Nothing else is converted, deliberately. node:sqlite rejects a bound
     * boolean rather than coercing it, so accepting one here would make the
     * Android tier the lenient one and hide a call the Node tier would have
     * failed - in exactly the parity the contract suite exists to prove. The
     * schema stores booleans as 0/1 (see {@code bool} in journal/support.ts)
     * and the journal converts above the driver, so this is unreachable in
     * practice; it is a refusal rather than a conversion so that if it ever
     * is reached, both tiers say so.
     */
    private static Object[] bindArgs(JSONArray params) throws JSONException {
        if (params == null) return new Object[0];
        Object[] args = new Object[params.length()];
        for (int i = 0; i < params.length(); i++) {
            Object raw = params.isNull(i) ? null : params.get(i);
            if (raw instanceof Number) {
                double d = ((Number) raw).doubleValue();
                args[i] = d == Math.rint(d) && !Double.isInfinite(d) ? (Object) (long) d : (Object) d;
            } else {
                args[i] = raw;
            }
        }
        return args;
    }

    private static Object value(Cursor cursor, int column) {
        switch (cursor.getType(column)) {
            case Cursor.FIELD_TYPE_NULL:
                return JSONObject.NULL;
            case Cursor.FIELD_TYPE_INTEGER:
                return cursor.getLong(column);
            case Cursor.FIELD_TYPE_FLOAT:
                return cursor.getDouble(column);
            case Cursor.FIELD_TYPE_BLOB:
                /* The schema has no BLOB column: photos are files (ADR-0008)
                   and the archive is built outside SQLite (ADR-0007). Inventing
                   an encoding here would give the tiers different row shapes
                   for a value none of them stores, so this refuses instead. */
                throw new IllegalStateException(
                    "BLOB column '" + cursor.getColumnName(column) + "' has no cross-tier representation");
            default:
                return cursor.getString(column);
        }
    }
}
