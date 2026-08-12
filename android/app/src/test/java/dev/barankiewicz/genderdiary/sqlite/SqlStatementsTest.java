package dev.barankiewicz.genderdiary.sqlite;

import static org.junit.Assert.assertEquals;

import java.util.List;

import org.junit.Test;

/**
 * A JVM test - no device needed. The splitter exists because Android's
 * SQLiteDatabase.execSQL runs exactly one statement, while the migration
 * runner hands the driver whole schema scripts, and the web driver's
 * sqlite3mc exec takes them as they are.
 *
 * <p>The case that makes this more than a String.split(";") is migration v3:
 * a CREATE TRIGGER whose body ends in a semicolon before its own END.
 */
public class SqlStatementsTest {

    @Test
    public void splitsPlainStatements() {
        List<String> out = SqlStatements.split("CREATE TABLE a (x); CREATE TABLE b (y);");
        assertEquals(2, out.size());
        assertEquals("CREATE TABLE a (x)", out.get(0));
        assertEquals("CREATE TABLE b (y)", out.get(1));
    }

    @Test
    public void ignoresTrailingWhitespaceAndEmptyStatements() {
        List<String> out = SqlStatements.split("\n  SELECT 1;\n\n;;\n  SELECT 2  ;\n");
        assertEquals(List.of("SELECT 1", "SELECT 2"), out);
    }

    @Test
    public void toleratesAMissingFinalSemicolon() {
        assertEquals(List.of("SELECT 1", "SELECT 2"), SqlStatements.split("SELECT 1; SELECT 2"));
    }

    @Test
    public void keepsSemicolonsInsideStringLiterals() {
        List<String> out = SqlStatements.split("INSERT INTO t VALUES ('a;b'); SELECT 1;");
        assertEquals(2, out.size());
        assertEquals("INSERT INTO t VALUES ('a;b')", out.get(0));
    }

    @Test
    public void keepsDoubledQuotesInsideStringLiterals() {
        List<String> out = SqlStatements.split("INSERT INTO t VALUES ('it''s; fine'); SELECT 1;");
        assertEquals(2, out.size());
        assertEquals("INSERT INTO t VALUES ('it''s; fine')", out.get(0));
    }

    @Test
    public void keepsSemicolonsInsideQuotedIdentifiers() {
        List<String> out = SqlStatements.split("CREATE TABLE \"odd;name\" (x); SELECT 1;");
        assertEquals(2, out.size());
        assertEquals("CREATE TABLE \"odd;name\" (x)", out.get(0));
    }

    @Test
    public void dropsLineComments() {
        List<String> out = SqlStatements.split("-- a comment; with a semicolon\nSELECT 1;");
        assertEquals(List.of("SELECT 1"), out);
    }

    @Test
    public void dropsBlockComments() {
        List<String> out = SqlStatements.split("/* block; comment */ SELECT 1; /* trailing */");
        assertEquals(List.of("SELECT 1"), out);
    }

    /** Migration v3, the reason this class exists. */
    @Test
    public void keepsATriggerBodyWhole() {
        String sql =
            "DROP TABLE entry_fts;\n"
                + "CREATE VIRTUAL TABLE entry_fts USING fts5(\n"
                + "  folded_text,\n"
                + "  content='',\n"
                + "  contentless_delete=1\n"
                + ");\n"
                + "CREATE TRIGGER entry_fts_after_delete AFTER DELETE ON entry BEGIN\n"
                + "  DELETE FROM entry_fts WHERE rowid = old.id;\n"
                + "END;\n";

        List<String> out = SqlStatements.split(sql);

        assertEquals(3, out.size());
        assertEquals("DROP TABLE entry_fts", out.get(0));
        assertEquals(
            "CREATE TRIGGER entry_fts_after_delete AFTER DELETE ON entry BEGIN\n"
                + "  DELETE FROM entry_fts WHERE rowid = old.id;\n"
                + "END",
            out.get(2));
    }

    /** BEGIN as a transaction keyword is not a trigger body opener. */
    @Test
    public void treatsBareBeginAsItsOwnStatement() {
        assertEquals(List.of("BEGIN", "SELECT 1", "COMMIT"), SqlStatements.split("BEGIN; SELECT 1; COMMIT;"));
    }

    /** BEGIN inside an identifier must not open a block. */
    @Test
    public void doesNotTreatBeginningAsBegin() {
        List<String> out = SqlStatements.split("SELECT beginning FROM t; SELECT 2;");
        assertEquals(2, out.size());
    }

    @Test
    public void handlesACaseExpressionWithoutSwallowingTheStatement() {
        List<String> out =
            SqlStatements.split("SELECT CASE WHEN x THEN 1 ELSE 2 END FROM t; SELECT 2;");
        assertEquals(2, out.size());
        assertEquals("SELECT CASE WHEN x THEN 1 ELSE 2 END FROM t", out.get(0));
    }
}
