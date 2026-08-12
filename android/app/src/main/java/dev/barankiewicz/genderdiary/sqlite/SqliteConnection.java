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

    /** ADR-0006's copy, taken before a migration and removed after it. */
    private static final String PRE_MIGRATION_SUFFIX = ".pre-migration";

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

    static void loadNativeLibrary() {
        System.loadLibrary("sqlcipher");
    }

    void open(Context context, String name, String hexKey) {
        close();
        databaseFile = context.getDatabasePath(name);
        File parent = databaseFile.getParentFile();
        if (parent != null) parent.mkdirs();
        database =
            SQLiteDatabase.openOrCreateDatabase(databaseFile, rawKeyPassword(hexKey), null, null, null);
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
     */
    private static Object[] bindArgs(JSONArray params) throws JSONException {
        if (params == null) return new Object[0];
        Object[] args = new Object[params.length()];
        for (int i = 0; i < params.length(); i++) {
            Object raw = params.isNull(i) ? null : params.get(i);
            if (raw instanceof Number) {
                double d = ((Number) raw).doubleValue();
                args[i] = d == Math.rint(d) && !Double.isInfinite(d) ? (Object) (long) d : (Object) d;
            } else if (raw instanceof Boolean) {
                args[i] = ((Boolean) raw) ? 1L : 0L;
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
