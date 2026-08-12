package dev.barankiewicz.genderdiary.sqlite;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

import android.content.Context;
import android.database.Cursor;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import net.zetetic.database.sqlcipher.SQLiteDatabase;

import org.junit.Before;
import org.junit.BeforeClass;
import org.junit.Test;
import org.junit.runner.RunWith;

import java.io.File;

/**
 * What the native SQLite build actually has, asserted rather than assumed
 * (ticket 11's acceptance).
 *
 * <p>The risk this covers is real and was measured: ticket 08 found the
 * framework SQLite on the API 35 emulator has no FTS5 at all, which is one
 * of the two reasons the journal is on SQLCipher (ADR-0020). A build missing
 * FTS5 or the window functions would fail in search or in the streak and
 * nowhere else, on a device, long after this ticket.
 *
 * <p>The raw-key open is here for a different reason. Ticket 08's probe
 * opened with a passphrase and let SQLCipher run its KDF, and recorded the
 * raw-key path as documented rather than exercised - and the raw key is the
 * whole argument for writing this bridge instead of taking
 * {@code @capacitor-community/sqlite} (ADR-0020's ticket 11 amendment). So
 * it is demonstrated here, three tickets before ticket 13 builds on it.
 */
@RunWith(AndroidJUnit4.class)
public class NativeSqliteCapabilitiesTest {

    /** 32 bytes, the size ADR-0018's data key is. Fixed, so a failure repeats. */
    private static final String RAW_KEY =
        "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";

    private File dbFile;

    @BeforeClass
    public static void loadNativeLibrary() {
        System.loadLibrary("sqlcipher");
    }

    private static Context context() {
        return InstrumentationRegistry.getInstrumentation().getTargetContext();
    }

    @Before
    public void freshDatabase() {
        dbFile = context().getDatabasePath("capabilities-test.db");
        File parent = dbFile.getParentFile();
        if (parent != null) parent.mkdirs();
        for (String suffix : new String[] {"", "-wal", "-shm", "-journal"}) {
            File f = new File(dbFile.getPath() + suffix);
            if (f.exists()) assertTrue("could not clear " + f, f.delete());
        }
    }

    /** The schema's entry_fts depends on this; there is no degraded search mode. */
    @Test
    public void theBuildHasFts5() {
        try (SQLiteDatabase db = open(null)) {
            db.execSQL("CREATE VIRTUAL TABLE fts_probe USING fts5(folded_text, content='')");
            db.execSQL("INSERT INTO fts_probe (rowid, folded_text) VALUES (1, 'zazolc gesla jazn')");
            assertEquals(1, count(db, "SELECT COUNT(*) FROM fts_probe WHERE fts_probe MATCH 'gesla'"));
        }
    }

    /**
     * Migration v3's option, without which an edited or deleted entry cannot
     * leave the index (ticket 09).
     */
    @Test
    public void theBuildHasContentlessDelete() {
        try (SQLiteDatabase db = open(null)) {
            db.execSQL("CREATE VIRTUAL TABLE fts_probe USING fts5(folded_text, content='', contentless_delete=1)");
            db.execSQL("INSERT INTO fts_probe (rowid, folded_text) VALUES (1, 'lozko')");
            db.execSQL("DELETE FROM fts_probe WHERE rowid = 1");
            assertEquals(0, count(db, "SELECT COUNT(*) FROM fts_probe WHERE fts_probe MATCH 'lozko'"));
        }
    }

    /** ADR-0012's streak is the codebase's only window function. */
    @Test
    public void theBuildHasWindowFunctions() {
        try (SQLiteDatabase db = open(null)) {
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
     * passphrase: ADR-0018 hands SQLCipher a random data key with no KDF pass
     * over it, and ADR-0013 keeps the single stretching step in the layer above.
     */
    @Test
    public void aRawKeyOpensAndReopensTheDatabase() {
        try (SQLiteDatabase db = open(RAW_KEY)) {
            db.execSQL("CREATE TABLE entry (id INTEGER PRIMARY KEY, note TEXT)");
            db.execSQL("INSERT INTO entry (note) VALUES ('zażółć gęślą jaźń')");
        }

        try (SQLiteDatabase reopened = open(RAW_KEY)) {
            assertEquals(1, count(reopened, "SELECT COUNT(*) FROM entry"));
        }
    }

    /** A raw key that is not the right one has to fail, not read plaintext. */
    @Test
    public void aWrongRawKeyIsRejected() {
        try (SQLiteDatabase db = open(RAW_KEY)) {
            db.execSQL("CREATE TABLE entry (id INTEGER PRIMARY KEY)");
        }

        String wrong = "ff" + RAW_KEY.substring(2);
        try (SQLiteDatabase bad = open(wrong)) {
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
    public void aTriggerBodySurvivesTheSplitter() {
        try (SQLiteDatabase db = open(null)) {
            db.execSQL("CREATE TABLE entry (id INTEGER PRIMARY KEY)");
            for (String statement :
                SqlStatements.split(
                    "CREATE VIRTUAL TABLE entry_fts USING fts5(folded_text, content='', contentless_delete=1);\n"
                        + "CREATE TRIGGER entry_fts_after_delete AFTER DELETE ON entry BEGIN\n"
                        + "  DELETE FROM entry_fts WHERE rowid = old.id;\n"
                        + "END;\n")) {
                db.execSQL(statement);
            }

            db.execSQL("INSERT INTO entry (id) VALUES (1)");
            db.execSQL("INSERT INTO entry_fts (rowid, folded_text) VALUES (1, 'lozko')");
            db.execSQL("DELETE FROM entry WHERE id = 1");

            assertEquals(
                "the trigger did not fire, so the split lost its body",
                0,
                count(db, "SELECT COUNT(*) FROM entry_fts"));
        }
    }

    private SQLiteDatabase open(String hexKey) {
        String password = hexKey == null ? "" : "x'" + hexKey + "'";
        return SQLiteDatabase.openOrCreateDatabase(dbFile, password, null, null, null);
    }

    private static long count(SQLiteDatabase db, String sql) {
        try (Cursor cursor = db.rawQuery(sql, null)) {
            cursor.moveToFirst();
            return cursor.getLong(0);
        }
    }
}
