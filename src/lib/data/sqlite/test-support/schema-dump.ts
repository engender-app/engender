/* A database's shape, as text, for comparing two databases that were built
   different ways (ticket 34's squash: one baseline statement against the
   78-step chain it replaced).

   Everything compared here comes out of `sqlite_master`, which is the only
   place some of it is written down - a CHECK constraint appears in no pragma,
   and neither does the option list on a virtual table. The stored text is
   verbatim, though, so three differences that are not shape differences have
   to be forgiven first, which is what normalizeSql is for. */

import type { DatabaseSync } from 'node:sqlite';

/** Strips the three ways the same statement can be stored under different
    text: comments, whitespace, and the double quotes `ALTER TABLE ... RENAME`
    writes around a table name when it rewrites the CREATE. String literals are
    copied through untouched - a CHECK's allowlist is shape.

    Whitespace around brackets and commas goes entirely rather than collapsing
    to one space, because `ALTER TABLE ... ADD COLUMN` appends its column after
    whatever whitespace the last one ended on - `updated_at INTEGER NOT NULL ,
    trashed_at INTEGER` - and no hand-written column list would have that. */
export function normalizeSql(sql: string): string {
  const pieces: string[] = [];
  let plain = '';
  const flush = () => {
    pieces.push(plain.replace(/\s+/g, ' ').replace(/\s*([(),])\s*/g, '$1'));
    plain = '';
  };

  for (let i = 0; i < sql.length; ) {
    if (sql[i] === "'") {
      let end = i + 1;
      while (end < sql.length) {
        if (sql[end] === "'") {
          // '' inside a literal is an escaped quote, not the end of it.
          if (sql[end + 1] === "'") {
            end += 2;
            continue;
          }
          end += 1;
          break;
        }
        end += 1;
      }
      flush();
      pieces.push(sql.slice(i, end));
      i = end;
      continue;
    }

    if (sql[i] === '"') {
      const end = sql.indexOf('"', i + 1);
      const close = end === -1 ? sql.length : end;
      plain += sql.slice(i + 1, close);
      i = close + 1;
      continue;
    }

    if (sql[i] === '-' && sql[i + 1] === '-') {
      const nl = sql.indexOf('\n', i);
      plain += ' ';
      i = nl === -1 ? sql.length : nl;
      continue;
    }

    if (sql[i] === '/' && sql[i + 1] === '*') {
      const end = sql.indexOf('*/', i + 2);
      plain += ' ';
      i = end === -1 ? sql.length : end + 2;
      continue;
    }

    plain += sql[i];
    i += 1;
  }
  flush();

  return pieces.join('').trim();
}

/** Every object SQLite knows about, in a stable order. Rows with no SQL of
    their own are listed too: an implicit index is what a UNIQUE constraint
    turns into, so its absence would be a real difference. FTS5's shadow tables
    are listed for the same reason - which ones exist is decided by the option
    list on the virtual table. */
export function dumpSchema(raw: DatabaseSync): string {
  const rows = raw
    .prepare('SELECT type, name, tbl_name, sql FROM sqlite_master ORDER BY type, name')
    .all() as { type: string; name: string; tbl_name: string; sql: string | null }[];

  return rows
    .map(
      (row) =>
        `${row.type} ${row.name} on ${row.tbl_name}\n  ${row.sql === null ? '(implicit)' : normalizeSql(row.sql)}`
    )
    .join('\n');
}
