/* A deleted entry's note leaves the database with it.

   Counterevidence snapshots used to copy a good-moment entry's day, mood
   and note into a table of their own, with no link back. Trashing the entry
   and letting the trash window reclaim it left that copy behind, and
   nothing on screen said so. The snapshots are gone; this holds the
   promise they broke: once an entry is deleted for good, its note text is
   in no row of any table.

   The entry is made the kind Good moments offers back (a euphoria tag and a
   star), and everything that screen lets a person do with it is done
   before the delete. Every table the schema holds is then read whole, so a
   later area that copies note text somewhere fails here without anybody
   having to name it. */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { purgeExpiredTrash, TRASH_WINDOW_DAYS } from './entries.ts';
import { journalWithBuiltIns } from './test-support.ts';
import { fakeFileStore } from '../photos/test-support/fake-file-store.ts';
import { EUPHORIA_TAG_KEYS } from '../vocabulary/builtins.ts';
import { COUNTEREVIDENCE_LIMIT } from '../counterevidence.ts';
import type { Journal } from './journal.ts';

const NOTE = 'the mirror finally agreed with me today';

/** What Good moments offers a person to do with an entry in its pool. */
async function everythingGoodMomentsOffers(journal: Journal): Promise<void> {
  const pool = await journal.entries.counterevidencePool(EUPHORIA_TAG_KEYS, COUNTEREVIDENCE_LIMIT);
  assert.ok(pool.some((entry) => entry.note === NOTE), 'the entry is in the Good moments pool');
}

test('an entry deleted for good leaves no copy of its note in any table', async () => {
  const { journal, db } = await journalWithBuiltIns();
  const id = await journal.entries.upsertEntry({ epochDay: 20_000, mood: 5, note: NOTE, tags: [EUPHORIA_TAG_KEYS[0]] });
  await journal.entries.setEntryStarred(id, true);

  await everythingGoodMomentsOffers(journal);

  await journal.entries.deleteEntry(id);
  const pastWindow = Date.now() - TRASH_WINDOW_DAYS * 24 * 60 * 60 * 1000 - 1;
  db.raw.prepare('UPDATE entry SET trashed_at = ? WHERE id = ?').run(pastWindow, id);
  assert.equal(await purgeExpiredTrash(db, fakeFileStore()), 1);

  const tables = db.raw
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all() as { name: string }[];
  assert.ok(tables.length > 50, `read ${tables.length} tables`);
  const holding: string[] = [];
  for (const { name } of tables) {
    const quoted = `"${name.replaceAll('"', '""')}"`;
    const columns = db.raw.prepare(`SELECT name FROM pragma_table_info('${name.replaceAll("'", "''")}')`).all() as {
      name: string;
    }[];
    for (const column of columns) {
      const col = `"${column.name.replaceAll('"', '""')}"`;
      const row = db.raw.prepare(`SELECT COUNT(*) AS n FROM ${quoted} WHERE instr(CAST(${col} AS TEXT), ?) > 0`).get(NOTE) as {
        n: number;
      };
      if (row.n > 0) holding.push(`${name}.${column.name}`);
    }
  }
  assert.deepEqual(holding, [], 'no table keeps the deleted entry’s note');
});
