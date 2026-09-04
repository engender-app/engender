/* The driver that says what it touched (phase 8 audit ticket 01).

   A fifth adapter at the `SqliteDriver` seam (ADR-0017), beside node-sqlite,
   sqlocal, the message-channel driver and the Android one. It wraps any of
   them and answers two questions the repo could not ask before:

   1. **Which tables did this operation touch, and which of them did it
      write?** `live/writes.ts` classifies every operation as a read or a
      write against a hand-written table list sitting two files from the SQL
      it describes, and nothing compares the two. Its own header names the
      cost: a write misfiled as a read shows stale data forever, and the
      failure looks like a Svelte bug. With this, the comparison is a test.

   2. **How many statements did it fire, and how many bytes came back?**
      Those are the metrics this architecture is actually priced in. Native
      SQLite answers almost every hot read on a ten-year journal in under
      2ms; what costs is the crossing. `mc-driver.ts` posts one message per
      statement to a worker that serialises everything, and
      `android-driver.ts` turns each statement into a Capacitor bridge call
      that its own comment prices at "tens of milliseconds whatever SQL sits
      behind it". So a screen's cost is a statement count and a byte count,
      and a benchmark that reports only milliseconds is measuring the cheap
      half of this system on desktop.

   Wrapped from outside rather than instrumented inside each driver, which
   is what makes the numbers comparable: the same statement counted the same
   way whichever platform is underneath. It is the same wrapping the
   encrypting file store makes over the raw one.

   **Test support, and it has to stay there.** Every recorded statement pays
   a `JSON.stringify` of its own result, which is precisely the cost the app
   must not carry. Its own test asserts nothing in `src/` outside test
   support imports it.

   **What it cannot see.** Triggers. `entry_fts` is written by triggers on
   `entry`, so a statement that says `INSERT INTO entry` announces `entry`
   and nothing else - which is the truth about the SQL and not the whole
   truth about the write. Whoever compares these against a declaration
   should expect that difference and record it rather than parse deeper. */

import type { SqliteDriver } from '../driver.ts';

export interface TablesTouched {
  /** Sorted, and never a CTE, an alias or a subquery. */
  read: readonly string[];
  wrote: readonly string[];
}

export interface RecordedStatement extends TablesTouched {
  sql: string;
  /** UTF-8 bytes of the JSON the statement handed back, which is what a
      serialising boundary charges for it. */
  bytes: number;
}

export interface Recording {
  /** One per crossing, in the order they crossed. A `query` and a `run` are
      one statement each; a multi-statement `exec` is one crossing carrying
      several, which is why the tables are a union over its whole text. */
  statements: readonly RecordedStatement[];
  bytes: number;
  read: readonly string[];
  wrote: readonly string[];
}

export interface RecordingDriver {
  driver: SqliteDriver;
  /** Runs an operation with the recorder open and hands back both its result
      and what crossed the seam while it ran. Windowed rather than always-on
      so the serialisation is only paid where a test is asking for it. */
  record<T>(operation: () => Promise<T>): Promise<{ result: T; recording: Recording }>;
}

/* SQL with its comments and string literals removed and its whitespace
   collapsed, so the patterns below cannot read a table name out of a
   comment or out of `WHERE value = 'from tag'`. One pass rather than three
   replaces, because a literal holding `--` and a comment holding an
   apostrophe each break whichever of the two runs second. */
function normalised(sql: string): string {
  let out = '';
  let i = 0;
  while (i < sql.length) {
    if (sql[i] === "'") {
      i++;
      while (i < sql.length) {
        if (sql[i] === "'") {
          if (sql[i + 1] === "'") {
            i += 2;
            continue;
          }
          i++;
          break;
        }
        i++;
      }
      out += "''";
      continue;
    }
    if (sql[i] === '-' && sql[i + 1] === '-') {
      while (i < sql.length && sql[i] !== '\n') i++;
      out += ' ';
      continue;
    }
    if (sql[i] === '/' && sql[i + 1] === '*') {
      i += 2;
      while (i < sql.length && !(sql[i] === '*' && sql[i + 1] === '/')) i++;
      i += 2;
      out += ' ';
      continue;
    }
    out += sql[i];
    i++;
  }
  return out.replace(/\s+/g, ' ');
}

const NAME = '[`"\\[]?([a-z_][a-z0-9_]*)';
const WROTE = new RegExp(
  `\\b(?:insert(?: or [a-z]+)? into|replace into|update(?: or [a-z]+)?|delete from) ${NAME}`,
  'gi'
);
/* One item of a table list: a name, optionally aliased. The alias is
   matched but never captured - it is here only so the comma after it still
   belongs to the list. */
const ITEM = '[`"\\[]?[a-z_][a-z0-9_]*(?: (?:as )?[a-z_][a-z0-9_]*)?';
/* A `FROM` or a `JOIN` and everything that hangs off it as a list, because
   SQLite's older cross-join spelling is a list rather than a keyword and
   `dimensions.ts` reconciles the built-in presets with one
   (`FROM gender_preset gp, gender_dimension gd`). A JOIN-only reading names
   the first table and silently drops the second.

   The lookbehind keeps a `DELETE`'s own `FROM` out of the read set, which
   is why a delete whose `WHERE` holds a subquery reports one table written
   and the subquery's table read. Whitespace is collapsed by the time this
   runs, so one space is the whole gap.

   `GROUP BY a, b` and `ORDER BY a, b` cannot be mistaken for the list: a
   comma continues it only where it directly follows an item, and `t GROUP`
   is one item followed by ` BY`, not by a comma. */
const READ = new RegExp(`(?<!delete )\\b(?:from|join) (${ITEM}(?:, ${ITEM})*)`, 'gi');
/** `WITH x AS (` and the `, y AS (` that follow it. A column alias cannot be
    followed by an open paren, so this needs no `WITH` anchor to be safe. */
const CTE = /\b([a-z_][a-z0-9_]*) as \(/gi;

/** Words that can stand where a table name is expected and are not one.
    `UPDATE ON entry` inside a trigger definition is the case that matters:
    a pattern reading `UPDATE <name>` takes `on` for a table, and a
    fabricated name is worse than a missing one - it sends whoever compares
    these against a declaration looking for a table that does not exist. */
const NOT_A_TABLE = new Set(['on', 'select', 'set', 'values', 'where']);

const namesIn = (pattern: RegExp, text: string): string[] =>
  [...text.matchAll(pattern)].map((match) => match[1].toLowerCase());

/** The leading name of each item in a matched table list. */
const listedNames = (text: string): string[] =>
  [...text.matchAll(READ)].flatMap((match) =>
    match[1].split(',').flatMap((item) => {
      const name = /^[`"[]?([a-z_][a-z0-9_]*)/i.exec(item.trim());
      return name ? [name[1].toLowerCase()] : [];
    })
  );

/** Which tables a statement - or a `;`-separated script - names, reads and
    writes apart. Text only: it reads the SQL, not the schema, so a trigger
    or a view's own tables are not in the answer. */
export function tablesTouched(sql: string): TablesTouched {
  const text = normalised(sql);
  const ctes = new Set(namesIn(CTE, text));
  const sorted = (names: string[]) =>
    [...new Set(names)].filter((name) => !ctes.has(name) && !NOT_A_TABLE.has(name)).sort();
  return { read: sorted(listedNames(text)), wrote: sorted(namesIn(WROTE, text)) };
}

const encoder = new TextEncoder();
const jsonBytes = (payload: unknown): number =>
  payload === undefined ? 0 : encoder.encode(JSON.stringify(payload)).length;

export function recordingDriver(inner: SqliteDriver): RecordingDriver {
  let open: RecordedStatement[] | null = null;

  const note = (sql: string, payload: unknown) => {
    if (open) open.push({ sql, bytes: jsonBytes(payload), ...tablesTouched(sql) });
  };

  const driver: SqliteDriver = {
    async query<Row extends Record<string, unknown> = Record<string, unknown>>(sql: string, params?: unknown[]) {
      const rows = await inner.query<Row>(sql, params);
      note(sql, rows);
      return rows;
    },
    async run(sql: string, params?: unknown[]) {
      const result = await inner.run(sql, params);
      note(sql, result);
      return result;
    },
    async exec(sql: string) {
      await inner.exec(sql);
      note(sql, undefined);
    },
    getUserVersion: () => inner.getUserVersion(),
    setUserVersion: (version: number) => inner.setUserVersion(version),
    /* Delegated whole: the transaction's own BEGIN and COMMIT are the
       inner driver's business, and the statements inside the callback reach
       this wrapper anyway because the callback holds it. */
    transaction: <T>(fn: () => T | Promise<T>) => inner.transaction(fn),
    close: () => inner.close()
  };

  return {
    driver,
    async record<T>(operation: () => Promise<T>) {
      if (open) throw new Error('the recording driver is already recording');
      const statements: RecordedStatement[] = [];
      open = statements;
      try {
        const result = await operation();
        const union = (of: (statement: RecordedStatement) => readonly string[]) =>
          [...new Set(statements.flatMap((statement) => of(statement)))].sort();
        return {
          result,
          recording: {
            statements,
            bytes: statements.reduce((total, statement) => total + statement.bytes, 0),
            read: union((statement) => statement.read),
            wrote: union((statement) => statement.wrote)
          }
        };
      } finally {
        open = null;
      }
    }
  };
}
