package dev.engender.app.sqlite;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;

import android.content.Context;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import org.junit.After;
import org.junit.Before;
import org.junit.BeforeClass;
import org.junit.Test;
import org.junit.runner.RunWith;

import java.io.File;

/**
 * "Delete everything and start over" from a locked gate (ux-carpet 210).
 *
 * <p>The gate runs before any key exists, so in a cold process nothing has
 * opened the journal yet. The wipe used to find its files through the path
 * the last open had recorded, and with no open behind it that path was null:
 * it deleted nothing, the Keystore key went, and the next setup minted a new
 * key over the old ciphertext. Every launch after that failed with
 * {@code hmac check failed} until the app was uninstalled.
 *
 * <p>Each connection here is a fresh object, standing in for a fresh process.
 */
@RunWith(AndroidJUnit4.class)
public class StartOverWipeTest {

    private static final String NAME = "start-over-test.sqlite3";
    private static final String OLD_KEY =
        "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";
    private static final String NEW_KEY =
        "f0e0d0c0b0a090807060504030201000f0e0d0c0b0a090807060504030201000";
    private static final String[] SUFFIXES = {"", "-wal", "-shm", "-journal", ".pre-migration-backup"};

    @BeforeClass
    public static void loadNativeLibrary() {
        SqliteConnection.loadNativeLibrary();
    }

    private static Context context() {
        return InstrumentationRegistry.getInstrumentation().getTargetContext();
    }

    private static File file(String suffix) {
        return new File(context().getDatabasePath(NAME).getPath() + suffix);
    }

    @Before
    @After
    public void clear() {
        for (String suffix : SUFFIXES) file(suffix).delete();
    }

    /** A journal written and closed under the old key, as the previous process left it. */
    private static void writeOldJournal() throws Exception {
        SqliteConnection previous = new SqliteConnection();
        previous.open(context(), NAME, OLD_KEY);
        previous.exec("CREATE TABLE entry (id INTEGER PRIMARY KEY, note TEXT); INSERT INTO entry (note) VALUES ('old');");
        previous.copyDatabaseFile();
        previous.close();
    }

    @Test
    public void aWipeInAProcessThatNeverOpenedTheJournalStillDeletesIt() throws Exception {
        writeOldJournal();

        new SqliteConnection().deleteDatabaseFiles(context(), NAME);

        for (String suffix : SUFFIXES) {
            assertFalse("the wipe left " + file(suffix).getName(), file(suffix).exists());
        }
    }

    @Test
    public void theNewKeyOpensAFreshJournalAfterTheWipe() throws Exception {
        writeOldJournal();

        new SqliteConnection().deleteDatabaseFiles(context(), NAME);

        SqliteConnection next = new SqliteConnection();
        next.open(context(), NAME, NEW_KEY);
        next.exec("CREATE TABLE entry (id INTEGER PRIMARY KEY, note TEXT);");
        assertEquals(0, next.getUserVersion());
        next.close();
    }
}
