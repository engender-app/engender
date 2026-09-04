/* The coarse-name-to-SQL-table declaration checked against the schema it
   claims to describe (ticket 02), the same way ticket 01's own test checks
   a table the parser invents against `sqlite_master`: a table renamed or
   dropped in a migration and forgotten here fails on sight rather than
   leaving a stale name in the mapping. */

import assert from 'node:assert/strict';
import { test } from 'vitest';
import { migratedDb } from '../sqlite/test-support/migrated-db.ts';
import { TABLE_NAMES } from './writes.ts';
import { SQL_TABLES, UNMAPPED_TABLES } from './sqlTables.ts';

test('every coarse name maps to at least one real table', () => {
  for (const name of TABLE_NAMES) {
    assert.ok(SQL_TABLES[name]?.length > 0, `TABLE_NAMES has no SQL_TABLES entry for '${name}'`);
  }
});

test('SQL_TABLES and UNMAPPED_TABLES together name every table the schema actually has, and nothing else', async () => {
  const driver = await migratedDb();
  const rows = await driver.query<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table'");
  const real = new Set(rows.map((row) => row.name));

  const declared = new Set(Object.values(SQL_TABLES).flat());
  const unmapped = new Set(Object.keys(UNMAPPED_TABLES));

  for (const table of declared) {
    assert.ok(!unmapped.has(table), `'${table}' is in both SQL_TABLES and UNMAPPED_TABLES`);
    assert.ok(real.has(table), `SQL_TABLES names '${table}', which sqlite_master does not have`);
  }
  for (const table of unmapped) {
    assert.ok(real.has(table), `UNMAPPED_TABLES names '${table}', which sqlite_master does not have`);
  }
  for (const table of real) {
    assert.ok(
      declared.has(table) || unmapped.has(table),
      `'${table}' exists in the schema but neither SQL_TABLES nor UNMAPPED_TABLES accounts for it`
    );
  }
});
