package dev.engender.app.sqlite;

import android.os.StatFs;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Implement the SQL seam (ADR-0017) with SQLCipher and a raw random
 * data key supplied as hex (ADR-0018, ADR-0020). Java derives no key.
 *
 * <p>{@link CallSequencer} runs numbered bridge calls on the single
 * plugin worker (ADR-0089). Keep begin, commit and rollback explicit,
 * matching the web worker and allowing a migration to call exec
 * within its transaction.
 */
@CapacitorPlugin(name = "Sqlite")
public class SqlitePlugin extends Plugin {

    private final SqliteConnection connection = new SqliteConnection();

    /* One thread of this plugin's own for every call that touches the
       connection, so the order the sequencer settles on is the order SQLite
       sees, and so a long statement never holds up another plugin's calls on
       Capacitor's shared plugin thread. */
    private final ExecutorService worker =
        Executors.newSingleThreadExecutor((runnable) -> new Thread(runnable, "SqlitePlugin"));

    /** Only ever touched on {@link #worker}. */
    private final CallSequencer sequencer = new CallSequencer();

    @Override
    public void load() {
        SqliteConnection.loadNativeLibrary();
    }

    @Override
    protected synchronized void handleOnDestroy() {
        // Finish admitted writes before releasing SQLCipher's keyed connection.
        // Activity recreation otherwise leaves both it and this thread alive.
        worker.execute(connection::dispose);
        worker.shutdown();
        super.handleOnDestroy();
    }

    /**
     * Open or create the journal.
     *
     * <p>Pass an optional 64-character hex key directly to SQLCipher, without
     * a KDF pass.
     */
    @PluginMethod
    public void open(PluginCall call) {
        sequenced(call, () -> {
            String name = call.getString("name");
            if (name == null || name.isEmpty()) {
                call.reject("open requires a database name");
                return;
            }
            try {
                connection.open(getContext(), name, call.getString("hexKey"));
                call.resolve();
            } catch (Exception e) {
                fail(call, e);
            }
        });
    }

    /**
     * Whether the named database is a plaintext one, asked before anything is
     * opened. A journal written by the pre-encryption Android
     * build is the only way this is true, and the boot says so plainly rather
     * than letting a raw-key open fail as a corrupt file.
     */
    @PluginMethod
    public void isPlaintextDatabase(PluginCall call) {
        execute(call, () -> {
            String name = call.getString("name");
            if (name == null || name.isEmpty()) {
                call.reject("isPlaintextDatabase requires a database name");
                return;
            }
            try {
                JSObject result = new JSObject();
                result.put("plaintext", SqliteConnection.isPlaintextDatabase(getContext(), name));
                result.put("exists", getContext().getDatabasePath(name).exists());
                call.resolve(result);
            } catch (Exception e) {
                fail(call, e);
            }
        });
    }

    /** Runs one or more statements for their effect. Used by migrations. */
    @PluginMethod
    public void exec(PluginCall call) {
        sequenced(call, () -> {
            String sql = call.getString("sql");
            if (sql == null) {
                call.reject("exec requires sql");
                return;
            }
            try {
                connection.exec(sql);
                call.resolve();
            } catch (Exception e) {
                fail(call, e);
            }
        });
    }

    /** Runs a parameterized query and returns its rows as JSON objects. */
    @PluginMethod
    public void query(PluginCall call) {
        sequenced(call, () -> {
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
                fail(call, e);
            }
        });
    }

    /**
     * Runs a parameterized statement that returns no rows, reporting the
     * change count and inserted rowid the journal's identity scheme reads
     * (ADR-0002): an unknown-id write is a write that changed nothing, and
     * the journal turns that into a throw.
     */
    @PluginMethod
    public void run(PluginCall call) {
        sequenced(call, () -> {
            String sql = call.getString("sql");
            if (sql == null) {
                call.reject("run requires sql");
                return;
            }
            try {
                call.resolve(connection.run(sql, params(call)));
            } catch (Exception e) {
                fail(call, e);
            }
        });
    }

    @PluginMethod
    public void getUserVersion(PluginCall call) {
        sequenced(call, () -> {
            try {
                JSObject result = new JSObject();
                result.put("version", connection.getUserVersion());
                call.resolve(result);
            } catch (Exception e) {
                fail(call, e);
            }
        });
    }

    @PluginMethod
    public void setUserVersion(PluginCall call) {
        sequenced(call, () -> {
            Integer version = call.getInt("version");
            if (version == null) {
                call.reject("setUserVersion requires a version");
                return;
            }
            try {
                connection.setUserVersion(version);
                call.resolve();
            } catch (Exception e) {
                fail(call, e);
            }
        });
    }

    @PluginMethod
    public void beginTransaction(PluginCall call) {
        sequenced(call, () -> transactionStep(call, SqliteConnection.TransactionStep.BEGIN));
    }

    @PluginMethod
    public void commitTransaction(PluginCall call) {
        sequenced(call, () -> transactionStep(call, SqliteConnection.TransactionStep.COMMIT));
    }

    @PluginMethod
    public void rollbackTransaction(PluginCall call) {
        sequenced(call, () -> transactionStep(call, SqliteConnection.TransactionStep.ROLLBACK));
    }

    /**
     * The pre-migration copy ADR-0006 takes before a forward-only migration
     * runs, and its cleanup once the migration committed.
     */
    @PluginMethod
    public void copyDatabaseFile(PluginCall call) {
        sequenced(call, () -> {
            try {
                connection.copyDatabaseFile();
                call.resolve();
            } catch (Exception e) {
                fail(call, e);
            }
        });
    }

    /** Whether there is a copy worth going back to. */
    @PluginMethod
    public void preMigrationCopyIsUsable(PluginCall call) {
        sequenced(call, () -> {
            try {
                JSObject result = new JSObject();
                result.put("usable", connection.preMigrationCopyIsUsable());
                call.resolve(result);
            } catch (Exception e) {
                fail(call, e);
            }
        });
    }

    /** Puts that copy back as the live database and closes the connection. */
    @PluginMethod
    public void restorePreMigrationCopy(PluginCall call) {
        sequenced(call, () -> {
            try {
                connection.restorePreMigrationCopy();
                call.resolve();
            } catch (Exception e) {
                fail(call, e);
            }
        });
    }

    @PluginMethod
    public void cleanupPreMigrationCopy(PluginCall call) {
        sequenced(call, () -> {
            try {
                connection.cleanupPreMigrationCopy();
                call.resolve();
            } catch (Exception e) {
                fail(call, e);
            }
        });
    }

    /** The reset path's wipe: the journal's files, which are in
        app-private storage rather than in the WebView's, so emptying OPFS
        does not reach them. */
    @PluginMethod
    public void deleteDatabase(PluginCall call) {
        execute(call, () -> {
            String name = call.getString("name");
            if (name == null || name.isEmpty()) {
                call.reject("deleteDatabase requires a database name");
                return;
            }
            try {
                connection.deleteDatabaseFiles(getContext(), name);
                call.resolve();
            } catch (Exception e) {
                fail(call, e);
            }
        });
    }

    @PluginMethod
    public void close(PluginCall call) {
        sequenced(call, () -> {
            try {
                connection.close();
                sequencer.finish(call.getString("session"));
                call.resolve();
            } catch (Exception e) {
                fail(call, e);
            }
        });
    }

    private void transactionStep(PluginCall call, SqliteConnection.TransactionStep step) {
        try {
            connection.transactionStep(step);
            call.resolve();
        } catch (Exception e) {
            fail(call, e);
        }
    }

    /**
     * Hands a connection call to the worker, to run when its turn in the
     * driver's sequence comes (ADR-0089). Every method that touches the open
     * connection goes through here; the two that run with no driver open
     * (isPlaintextDatabase, deleteDatabase) only share the worker.
     */
    private void sequenced(PluginCall call, Runnable work) {
        String session = call.getString("session");
        JSObject data = call.getData();
        if (session == null || session.isEmpty() || !data.has("seq")) {
            call.reject(call.getMethodName() + " requires a session and a sequence number");
            return;
        }
        long seq = data.optLong("seq", -1);
        execute(call, () -> sequencer.accept(session, seq, work, call::reject));
    }

    private synchronized void execute(PluginCall call, Runnable work) {
        if (worker.isShutdown()) {
            call.reject("sqlite bridge is closed");
            return;
        }
        worker.execute(work);
    }

    /** Bind parameters, defaulted to none so callers can omit them. */
    private static JSONArray params(PluginCall call) {
        JSArray params = call.getArray("params");
        return params == null ? new JSArray() : params;
    }

    /* Capacitor turns a null message into a null error on the JS side, which
       is how a real SQLite failure becomes "undefined" in a boot error. */
    /** Every failure keeps SQLite's own text; a full disk also carries the code {@code
        storage-full}. */
    private void fail(PluginCall call, Exception e) {
        call.reject(message(e), SqliteFailure.storageCode(message(e), databaseVolumeAvailableBytes()), e);
    }

    /** Free bytes on the volume that holds the journal and its rollback
        journal; unknown counts as plenty, so it never names a full disk. */
    private long databaseVolumeAvailableBytes() {
        try {
            return new StatFs(getContext().getDatabasePath("journal").getParent()).getAvailableBytes();
        } catch (Exception unknown) {
            return Long.MAX_VALUE;
        }
    }

    private static String message(Exception e) {
        String detail = e.getMessage();
        return detail == null || detail.isEmpty() ? e.getClass().getName() : detail;
    }
}
