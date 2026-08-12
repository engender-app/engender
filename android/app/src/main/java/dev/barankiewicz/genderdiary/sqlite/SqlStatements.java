package dev.barankiewicz.genderdiary.sqlite;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.List;

/**
 * Splits a SQL script into individual statements.
 *
 * <p>Android's {@code SQLiteDatabase.execSQL} prepares one statement and
 * ignores whatever follows it, silently. The migration runner hands the driver
 * whole schema scripts (ADR-0006), and the web driver's sqlite3mc takes them
 * unsplit, so the difference has to be absorbed here rather than by giving the
 * two platforms different migrations.
 *
 * <p>This is not a SQL parser and does not need to be. It tracks the four
 * things that can hide a semicolon in this repo's SQL - single-quoted strings,
 * double-quoted identifiers, line comments and block comments - plus the
 * trigger bodies in migration v3, where {@code BEGIN ... END} wraps statements
 * that end in semicolons of their own.
 */
final class SqlStatements {

    private SqlStatements() {}

    /** What an END closes: a trigger body, or a CASE expression inside one. */
    private enum Open {
        BLOCK,
        CASE_EXPRESSION
    }

    static List<String> split(String script) {
        List<String> statements = new ArrayList<>();
        StringBuilder current = new StringBuilder();
        /* Innermost first. A CASE inside a trigger body has to consume its own
           END, or the trigger closes early and the next semicolon splits its
           body - which execSQL would then run as a fragment without saying so. */
        Deque<Open> open = new ArrayDeque<>();

        int i = 0;
        while (i < script.length()) {
            char c = script.charAt(i);

            if (c == '\'' || c == '"') {
                int end = endOfQuoted(script, i, c);
                current.append(script, i, end);
                i = end;
                continue;
            }
            if (c == '-' && next(script, i) == '-') {
                i = endOfLineComment(script, i);
                continue;
            }
            if (c == '/' && next(script, i) == '*') {
                i = endOfBlockComment(script, i);
                continue;
            }

            if (isWordStart(script, i)) {
                int end = endOfWord(script, i);
                String word = script.substring(i, end);
                if (word.equalsIgnoreCase("BEGIN") && opensABlock(current)) open.push(Open.BLOCK);
                else if (word.equalsIgnoreCase("CASE")) open.push(Open.CASE_EXPRESSION);
                else if (word.equalsIgnoreCase("END") && !open.isEmpty()) open.pop();
                current.append(word);
                i = end;
                continue;
            }

            if (c == ';' && !open.contains(Open.BLOCK)) {
                addIfNotBlank(statements, current);
                current.setLength(0);
                i++;
                continue;
            }

            current.append(c);
            i++;
        }

        addIfNotBlank(statements, current);
        return statements;
    }

    /**
     * A {@code BEGIN} opens a block only when it is not the whole statement.
     * {@code BEGIN;} on its own is a transaction, which the driver issues for
     * every write; {@code ... ON entry BEGIN} is a trigger body.
     */
    private static boolean opensABlock(StringBuilder current) {
        return current.toString().trim().length() > 0;
    }

    private static void addIfNotBlank(List<String> statements, StringBuilder current) {
        String statement = current.toString().trim();
        if (!statement.isEmpty()) statements.add(statement);
    }

    private static char next(String script, int i) {
        return i + 1 < script.length() ? script.charAt(i + 1) : '\0';
    }

    private static boolean isWordStart(String script, int i) {
        char c = script.charAt(i);
        if (!Character.isLetter(c) && c != '_') return false;
        if (i == 0) return true;
        char before = script.charAt(i - 1);
        return !Character.isLetterOrDigit(before) && before != '_';
    }

    private static int endOfWord(String script, int i) {
        int end = i;
        while (end < script.length()) {
            char c = script.charAt(end);
            if (!Character.isLetterOrDigit(c) && c != '_') break;
            end++;
        }
        return end;
    }

    /** Returns the index just past the closing quote, honouring '' escapes. */
    private static int endOfQuoted(String script, int start, char quote) {
        int i = start + 1;
        while (i < script.length()) {
            if (script.charAt(i) == quote) {
                if (next(script, i) == quote) {
                    i += 2; // an escaped quote, not the end
                    continue;
                }
                return i + 1;
            }
            i++;
        }
        return script.length(); // unterminated; SQLite will complain, not us
    }

    private static int endOfLineComment(String script, int start) {
        int i = script.indexOf('\n', start);
        return i < 0 ? script.length() : i + 1;
    }

    private static int endOfBlockComment(String script, int start) {
        int i = script.indexOf("*/", start + 2);
        return i < 0 ? script.length() : i + 2;
    }
}
