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
    copied through untouched - a CHECK's allowlist is shape - and so is any
    identifier whose quotes are load-bearing, so two names that differ only
    inside their quotes never normalize to the same thing.

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
      let end = i + 1;
      let name = '';
      while (end < sql.length) {
        if (sql[end] === '"') {
          // "" inside a quoted identifier is an escaped quote, the same
          // doubling a string literal uses, not the end of the name.
          if (sql[end + 1] === '"') {
            name += '"';
            end += 2;
            continue;
          }
          end += 1;
          break;
        }
        name += sql[end];
        end += 1;
      }
      /* An identifier only needs its quotes because of what is inside it, so
         they come off only for the plain word SQLite would have written bare -
         which is the one case ALTER TABLE RENAME produces. Anything else keeps
         them and rides through verbatim like a string literal, since a space
         or a comma inside a name is part of the name and must not be squeezed
         out with the whitespace. */
      if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
        plain += name;
      } else {
        flush();
        pieces.push(`"${name.replace(/"/g, '""')}"`);
      }
      i = end;
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

/** Reads a dump back out of a fixture file, dropping the `#` header lines that
    say where it came from. A frozen dump is only worth as much as its
    provenance, and the provenance has to live in the file rather than in
    whatever commit message happened to accompany it. */
export function readSchemaFixture(text: string): string {
  return text
    .split('\n')
    .filter((line) => !line.startsWith('#'))
    .join('\n');
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
