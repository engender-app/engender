package dev.barankiewicz.genderdiary.sqlite;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;

/**
 * The Android half of the driver seam (ADR-0017): SQL in, rows out, and
 * nothing above it can tell this from the web driver.
 *
 * <p>Written here rather than taken from {@code @capacitor-community/sqlite}
 * because of the key model, not the library - see ADR-0020's ticket 11
 * amendment. That plugin takes a passphrase and derives the database key
 * itself; ADR-0018 wants a random data key held by the Keystore and handed to
 * SQLCipher raw. So the open below accepts a hex key and passes it through
 * unchanged, and derives nothing.
 *
 * <p>Every method is one bridge call, and the JS side serializes them, so the
 * connection needs no locking of its own beyond what {@link SqliteConnection}
 * already gives it. Transactions are explicit begin/commit/rollback calls
 * rather than a callback across the bridge, matching what the web driver does
 * over its worker for the same reason: the migration runner's callback calls
 * back into the driver's own exec.
 */
@CapacitorPlugin(name = "Sqlite")
public class SqlitePlugin extends Plugin {

    private final SqliteConnection connection = new SqliteConnection();

    @Override
    public void load() {
        SqliteConnection.loadNativeLibrary();
    }

    /**
     * Opens (or creates) the journal.
     *
     * <p>{@code hexKey} is optional and absent for now: ticket 11 lands the
     * shell and the driver, ticket 13 lands the Keystore that produces the
     * key. When it is present it is 64 hex characters of raw key, passed to
     * SQLCipher without a KDF pass.
     */
    @PluginMethod
    public void open(PluginCall call) {
        String name = call.getString("name");
        if (name == null || name.isEmpty()) {
            call.reject("open requires a database name");
            return;
        }
        try {
            connection.open(getContext(), name, call.getString("hexKey"));
            call.resolve();
        } catch (Exception e) {
            call.reject(message(e), e);
        }
    }

    /** Runs one or more statements for their effect. Used by migrations. */
    @PluginMethod
    public void exec(PluginCall call) {
        String sql = call.getString("sql");
        if (sql == null) {
            call.reject("exec requires sql");
            return;
        }
        try {
            connection.exec(sql);
            call.resolve();
        } catch (Exception e) {
            call.reject(message(e), e);
        }
    }

    /** Runs a parameterized query and returns its rows as JSON objects. */
    @PluginMethod
    public void query(PluginCall call) {
        String sql = call.getString("sql");
        if (sql == null) {
            call.reject("query requires sql");
            return;
        }
        try {
            JSObject result = new JSObject();
            result.put("rows", connection.query(sql, params(call)));
            call.resolve(result);
        } catch (Exception e) {
            call.reject(message(e), e);
        }
    }

    /**
     * Runs a parameterized statement that returns no rows, reporting the
     * change count and inserted rowid the journal's identity scheme reads
     * (ADR-0002): an unknown-id write is a write that changed nothing, and
     * the journal turns that into a throw.
     */
    @PluginMethod
    public void run(PluginCall call) {
        String sql = call.getString("sql");
        if (sql == null) {
            call.reject("run requires sql");
            return;
        }
        try {
            call.resolve(connection.run(sql, params(call)));
        } catch (Exception e) {
            call.reject(message(e), e);
        }
    }

    @PluginMethod
    public void getUserVersion(PluginCall call) {
        try {
            JSObject result = new JSObject();
            result.put("version", connection.getUserVersion());
            call.resolve(result);
        } catch (Exception e) {
            call.reject(message(e), e);
        }
    }

    @PluginMethod
    public void setUserVersion(PluginCall call) {
        Integer version = call.getInt("version");
        if (version == null) {
            call.reject("setUserVersion requires a version");
            return;
        }
        try {
            connection.setUserVersion(version);
            call.resolve();
        } catch (Exception e) {
            call.reject(message(e), e);
        }
    }

    @PluginMethod
    public void beginTransaction(PluginCall call) {
        transactionStep(call, SqliteConnection.TransactionStep.BEGIN);
    }

    @PluginMethod
    public void commitTransaction(PluginCall call) {
        transactionStep(call, SqliteConnection.TransactionStep.COMMIT);
    }

    @PluginMethod
    public void rollbackTransaction(PluginCall call) {
        transactionStep(call, SqliteConnection.TransactionStep.ROLLBACK);
    }

    /**
     * The pre-migration copy ADR-0006 takes before a forward-only migration
     * runs, and its cleanup once the migration committed.
     */
    @PluginMethod
    public void copyDatabaseFile(PluginCall call) {
        try {
            connection.copyDatabaseFile();
            call.resolve();
        } catch (Exception e) {
            call.reject(message(e), e);
        }
    }

    /** Whether there is a copy worth going back to (ticket 04). */
    @PluginMethod
    public void preMigrationCopyIsUsable(PluginCall call) {
        try {
            JSObject result = new JSObject();
            result.put("usable", connection.preMigrationCopyIsUsable());
            call.resolve(result);
        } catch (Exception e) {
            call.reject(message(e), e);
        }
    }

    /** Puts that copy back as the live database and closes the connection. */
    @PluginMethod
    public void restorePreMigrationCopy(PluginCall call) {
        try {
            connection.restorePreMigrationCopy();
            call.resolve();
        } catch (Exception e) {
            call.reject(message(e), e);
        }
    }

    @PluginMethod
    public void cleanupPreMigrationCopy(PluginCall call) {
        try {
            connection.cleanupPreMigrationCopy();
            call.resolve();
        } catch (Exception e) {
            call.reject(message(e), e);
        }
    }

    @PluginMethod
    public void close(PluginCall call) {
        try {
            connection.close();
            call.resolve();
        } catch (Exception e) {
            call.reject(message(e), e);
        }
    }

    private void transactionStep(PluginCall call, SqliteConnection.TransactionStep step) {
        try {
            connection.transactionStep(step);
            call.resolve();
        } catch (Exception e) {
            call.reject(message(e), e);
        }
    }

    /** Bind parameters, defaulted to none so callers can omit them. */
    private static JSONArray params(PluginCall call) {
        JSArray params = call.getArray("params");
        return params == null ? new JSArray() : params;
    }

    /* Capacitor turns a null message into a null error on the JS side, which
       is how a real SQLite failure becomes "undefined" in a boot error. */
    private static String message(Exception e) {
        String detail = e.getMessage();
        return detail == null || detail.isEmpty() ? e.getClass().getName() : detail;
    }
}
