package dev.engender.app.sqlite;

import static org.junit.Assert.assertEquals;

import android.content.Context;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import org.json.JSONArray;
import org.junit.After;
import org.junit.Before;
import org.junit.BeforeClass;
import org.junit.Test;
import org.junit.runner.RunWith;


/**
 * A committed transaction has to survive a power cut that follows the
 * commit's return. In rollback-journal mode the commit point is the journal
 * file's deletion, and only {@code synchronous = EXTRA} syncs the directory
 * after that delete: NORMAL leaves the journal and database writes to the
 * kernel, and FULL still leaves the unlink unsynced, so a cut right after
 * COMMIT can bring the journal back and roll the commit undone. Carpet 09
 * saw that after {@code commitTransaction} resolved, and the emulator power
 * cut reproduces it under NORMAL (8 of 8) and FULL (8 of 8) and not under
 * EXTRA. The setting is asserted on the connection the bridge really opens
 * rather than assumed.
 */
@RunWith(AndroidJUnit4.class)
public class SqliteConnectionDurabilityTest {

    private static final int EXTRA = 3;
    private static final String NAME = "durability-test.db";
    private static final String RAW_KEY =
        "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";

    private final SqliteConnection connection = new SqliteConnection();

    @BeforeClass
    public static void loadNativeLibrary() {
        SqliteConnection.loadNativeLibrary();
    }

    private static Context context() {
        return InstrumentationRegistry.getInstrumentation().getTargetContext();
    }

    @Before
    @After
    public void clear() throws Exception {
        connection.deleteDatabaseFiles(context(), NAME);
    }

    private int synchronous() throws Exception {
        JSONArray rows = connection.query("PRAGMA synchronous", null);
        return rows.getJSONObject(0).getInt("synchronous");
    }

    @Test
    public void anEncryptedJournalOpensExtra() throws Exception {
        connection.open(context(), NAME, RAW_KEY);
        assertEquals(EXTRA, synchronous());
    }

    @Test
    public void aPlainDatabaseOpensExtra() throws Exception {
        connection.open(context(), NAME, null);
        assertEquals(EXTRA, synchronous());
    }

    @Test
    public void reopeningTheSameDatabaseKeepsExtra() throws Exception {
        connection.open(context(), NAME, RAW_KEY);
        connection.open(context(), NAME, RAW_KEY);
        assertEquals(EXTRA, synchronous());
    }

    @Test
    public void staysExtraAfterATransactionAndAStatementThatNeedsTheConfigPass() throws Exception {
        connection.open(context(), NAME, RAW_KEY);
        connection.exec("CREATE TABLE t (a INTEGER)");
        connection.transactionStep(SqliteConnection.TransactionStep.BEGIN);
        connection.exec("INSERT INTO t VALUES (1)");
        connection.transactionStep(SqliteConnection.TransactionStep.COMMIT);
        assertEquals(EXTRA, synchronous());
    }
}
