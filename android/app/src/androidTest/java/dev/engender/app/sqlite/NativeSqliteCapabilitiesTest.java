package dev.engender.app.sqlite;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

import android.content.Context;
import androidx.test.core.app.ActivityScenario;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import dev.engender.app.MainActivity;
import dev.engender.app.webview.WebViewProbe;

import org.json.JSONArray;
import org.json.JSONObject;

import org.junit.After;
import org.junit.Before;
import org.junit.BeforeClass;
import org.junit.Test;
import org.junit.runner.RunWith;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;

/**
 * What the native SQLite build actually has, asserted rather than assumed.
 *
 * <p>The risk this covers is real and was measured: the framework SQLite on
 * the API 35 emulator has no FTS5 at all, which is one of the two reasons
 * the journal is on SQLCipher. A build missing FTS5 or the window functions
 * would fail in search or in the streak and nowhere else, on a device, long
 * after the fact.
 *
 * <p>The raw-key open is here for a different reason. An earlier probe
 * opened with a passphrase and let SQLCipher run its KDF, and recorded the
 * raw-key path as documented rather than exercised - and the raw key is the
 * whole argument for writing this bridge instead of taking
 * {@code @capacitor-community/sqlite}. So it is demonstrated here, ahead of
 * the Keystore work that builds on it.
 */
@RunWith(AndroidJUnit4.class)
public class NativeSqliteCapabilitiesTest {

    /** 32 bytes, the size the data key is. Fixed, so a failure repeats. */
    private static final String RAW_KEY =
        "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";

    private File dbFile;
    private File probeFile;
    private ActivityScenario<MainActivity> scenario;
    private WebViewProbe probe;

    @BeforeClass
    public static void loadNativeLibrary() {
        System.loadLibrary("sqlcipher");
    }

    private static Context context() {
        return InstrumentationRegistry.getInstrumentation().getTargetContext();
    }

    @Before
    public void freshDatabase() throws Exception {
        dbFile = context().getDatabasePath("capabilities-test.db");
        File parent = dbFile.getParentFile();
        if (parent != null) parent.mkdirs();
        for (String suffix : new String[] {"", "-wal", "-shm", "-journal"}) {
            File f = new File(dbFile.getPath() + suffix);
            if (f.exists()) assertTrue("could not clear " + f, f.delete());
        }
        probeFile = new File(context().getFilesDir(), "native-sqlite-capabilities-probe.html");
        try (InputStream input = InstrumentationRegistry.getInstrumentation().getContext()
                .getAssets().open("native-sqlite-capabilities-probe.html");
             FileOutputStream output = new FileOutputStream(probeFile)) {
            byte[] buffer = new byte[4096];
            int count;
            while ((count = input.read(buffer)) != -1) output.write(buffer, 0, count);
        }
        scenario = ActivityScenario.launch(MainActivity.class);
        probe = new WebViewProbe(scenario, 30);
        probe.loadFile(probeFile.getAbsolutePath());
        probe.awaitTrue("document.body && document.body.dataset.sqliteCapabilities === 'ready'"
            + " && !!window.Capacitor && typeof window.Capacitor.nativePromise === 'function'");
    }

    @After
    public void closeProbe() {
        if (scenario != null) scenario.close();
        if (probeFile != null) {
            assertTrue("could not remove the capability probe", probeFile.delete() || !probeFile.exists());
        }
    }

    /** The schema's entry_fts depends on this; there is no degraded search mode. */
    @Test
    public void theBuildHasFts5() throws Exception {
        try (Database db = open(null)) {
            db.execSQL("CREATE VIRTUAL TABLE fts_probe USING fts5(folded_text, content='')");
            db.execSQL("INSERT INTO fts_probe (rowid, folded_text) VALUES (1, 'zazolc gesla jazn')");
            assertEquals(1, count(db, "SELECT COUNT(*) FROM fts_probe WHERE fts_probe MATCH 'gesla'"));
        }
    }

    /**
     * Migration v3's option, without which an edited or deleted entry cannot
     * leave the index.
     */
    @Test
    public void theBuildHasContentlessDelete() throws Exception {
        try (Database db = open(null)) {
            db.execSQL("CREATE VIRTUAL TABLE fts_probe USING fts5(folded_text, content='', contentless_delete=1)");
            db.execSQL("INSERT INTO fts_probe (rowid, folded_text) VALUES (1, 'lozko')");
            db.execSQL("DELETE FROM fts_probe WHERE rowid = 1");
            assertEquals(0, count(db, "SELECT COUNT(*) FROM fts_probe WHERE fts_probe MATCH 'lozko'"));
        }
    }

    /** The streak calculation is the codebase's only window function. */
    @Test
    public void theBuildHasWindowFunctions() throws Exception {
        try (Database db = open(null)) {
            db.execSQL("CREATE TABLE entry (id INTEGER PRIMARY KEY, epoch_day INTEGER NOT NULL)");
            for (int day : new int[] {1000, 1001, 1002, 1004}) {
                db.execSQL("INSERT INTO entry (epoch_day) VALUES (" + day + ")");
            }
            long longestRun =
                count(
                    db,
                    "WITH days AS (SELECT DISTINCT epoch_day AS day FROM entry),"
                        + " numbered AS (SELECT day, ROW_NUMBER() OVER (ORDER BY day) AS rn FROM days)"
                        + " SELECT COUNT(*) AS n FROM numbered GROUP BY day - rn ORDER BY n DESC LIMIT 1");
            assertEquals(3, longestRun);
        }
    }

    /**
     * The whole reason this bridge exists instead of a plugin that takes a
     * passphrase: SQLCipher gets a random data key with no KDF pass over it,
     * and the single stretching step stays in the layer above.
     */
    @Test
    public void aRawKeyOpensAndReopensTheDatabase() throws Exception {
        try (Database db = open(RAW_KEY)) {
            db.execSQL("CREATE TABLE entry (id INTEGER PRIMARY KEY, note TEXT)");
            db.execSQL("INSERT INTO entry (note) VALUES ('zażółć gęślą jaźń')");
        }

        try (Database reopened = open(RAW_KEY)) {
            assertEquals(1, count(reopened, "SELECT COUNT(*) FROM entry"));
        }
    }

    /** A raw key that is not the right one has to fail, not read plaintext. */
    @Test
    public void aWrongRawKeyIsRejected() throws Exception {
        try (Database db = open(RAW_KEY)) {
            db.execSQL("CREATE TABLE entry (id INTEGER PRIMARY KEY)");
        }

        String wrong = "ff" + RAW_KEY.substring(2);
        try (Database bad = open(wrong)) {
            count(bad, "SELECT COUNT(*) FROM entry");
            fail("a wrong raw key opened and read the database");
        } catch (Exception expected) {
            assertNotNull(expected);
        }
    }

    /**
     * The schema arrives as whole scripts, and Android's execSQL takes one
     * statement - so the splitter and the real SQLite have to agree about
     * migration v3's trigger, whose body holds a semicolon of its own.
     */
    @Test
    public void aTriggerBodySurvivesTheSplitter() throws Exception {
        try (Database db = open(null)) {
            db.execSQL("CREATE TABLE entry (id INTEGER PRIMARY KEY)");
            db.execSQL(
                "CREATE VIRTUAL TABLE entry_fts USING fts5(folded_text, content='', contentless_delete=1);\n"
                    + "CREATE TRIGGER entry_fts_after_delete AFTER DELETE ON entry BEGIN\n"
                    + "  DELETE FROM entry_fts WHERE rowid = old.id;\n"
                    + "END;\n");

            db.execSQL("INSERT INTO entry (id) VALUES (1)");
            db.execSQL("INSERT INTO entry_fts (rowid, folded_text) VALUES (1, 'lozko')");
            db.execSQL("DELETE FROM entry WHERE id = 1");

            assertEquals(
                "the trigger did not fire, so the split lost its body",
                0,
                count(db, "SELECT COUNT(*) FROM entry_fts"));
        }
    }

    @Test
    public void busyTimeoutIsConfiguredOnConnectionOpen() throws Exception {
        Database conn = new Database("busy_timeout_test.db", "");
        try {
            org.json.JSONArray rows = conn.query("PRAGMA busy_timeout");
            assertEquals(1, rows.length());
            assertEquals(5000L, rows.getJSONObject(0).getLong("timeout"));
        } finally {
            conn.close();
            context().getDatabasePath("busy_timeout_test.db").delete();
        }
    }

    @Test
    public void foreignKeysAreEnabledOnProductionConnectionOpen() throws Exception {
        for (String key : new String[] {"", RAW_KEY}) {
            String name = key.isEmpty() ? "foreign-keys-plain.db" : "foreign-keys-encrypted.db";
            Database conn = new Database(name, key);
            try {
                assertEquals(1L, conn.query("PRAGMA foreign_keys")
                    .getJSONObject(0).getLong("foreign_keys"));
                conn.execSQL("CREATE TABLE parent (id INTEGER PRIMARY KEY);"
                    + "CREATE TABLE child (parent_id INTEGER REFERENCES parent(id) ON DELETE CASCADE);"
                    + "INSERT INTO parent VALUES (1); INSERT INTO child VALUES (1);");
                conn.execSQL("DELETE FROM parent;");
                assertEquals(0L, conn.query("SELECT COUNT(*) AS n FROM child")
                    .getJSONObject(0).getLong("n"));
                conn.execSQL("PRAGMA foreign_keys = OFF;");
                conn.reopen(key);
                assertEquals(1L, conn.query("PRAGMA foreign_keys")
                    .getJSONObject(0).getLong("foreign_keys"));
                conn.close();
                conn.reopen(key);
                assertEquals(1L, conn.query("PRAGMA foreign_keys")
                    .getJSONObject(0).getLong("foreign_keys"));
            } finally {
                conn.close();
                context().getDatabasePath(name).delete();
            }
        }
    }

    private Database open(String hexKey) throws Exception {
        return new Database(dbFile.getName(), hexKey);
    }

    private static long count(Database db, String sql) throws Exception {
        JSONObject row = db.query(sql).getJSONObject(0);
        return row.getLong(row.keys().next());
    }

    /** Uses the production bridge, whose calls remain reachable after release optimization. */
    private final class Database implements AutoCloseable {
        private final String name;
        private String session;
        private int sequence;
        private boolean closed = true;

        Database(String name, String key) throws Exception {
            this.name = name;
            reopen(key);
        }

        void reopen(String key) throws Exception {
            if (closed) {
                session = "sqlite-capabilities-" + System.nanoTime();
                sequence = 0;
                closed = false;
            }
            try {
                call("open", new JSONObject().put("name", name).put("hexKey", key == null ? "" : key));
            } catch (Exception error) {
                close();
                throw error;
            }
        }

        void execSQL(String sql) throws Exception {
            call("exec", new JSONObject().put("sql", sql));
        }

        JSONArray query(String sql) throws Exception {
            return call("query", new JSONObject().put("sql", sql).put("params", new JSONArray())).getJSONArray("rows");
        }

        private JSONObject call(String method, JSONObject options) throws Exception {
            options.put("session", session).put("seq", sequence++);
            probe.evaluate("window.__sqliteCapabilityResult = null;"
                + "window.Capacitor.nativePromise('Sqlite', " + JSONObject.quote(method) + ", " + options + ")"
                + ".then(function(value) { window.__sqliteCapabilityResult = { value: value == null ? {} : value }; },"
                + "function(error) { window.__sqliteCapabilityResult = { error: String(error.message || error) }; });");
            probe.awaitTrue("window.__sqliteCapabilityResult !== null");
            String encoded = probe.evaluate("JSON.stringify(window.__sqliteCapabilityResult)");
            JSONObject result = new JSONObject(new JSONArray("[" + encoded + "]").getString(0));
            if (result.has("error")) throw new IllegalStateException(result.getString("error"));
            return result.getJSONObject("value");
        }

        @Override
        public void close() throws Exception {
            if (closed) return;
            call("close", new JSONObject());
            closed = true;
        }
    }
}
