/* Search (ticket 09, ADR-0005, PRD F19). The cases that carry this module
   are the Polish ones: ł has no Unicode decomposition, so FTS5's own
   remove_diacritics cannot reach it and the fold has to happen in app code
   on both sides of the index. If these pass, the reason the fold exists is
   still true. */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { journalWithBuiltIns } from './test-support.ts';

/** Notes land on distinct days so newest-first is unambiguous. */
async function journalWithNotes(notes: string[]) {
  const { journal, db } = await journalWithBuiltIns();
  const ids: number[] = [];
  for (const [i, note] of notes.entries()) {
    ids.push(await journal.entries.upsertEntry({ epochDay: 100 + i, note }));
  }
  return { journal, db, ids };
}

test('a folded query finds text the fold reaches but FTS5 alone cannot', async () => {
  const { journal } = await journalWithNotes(['spałem w łóżko', 'zażółć gęślą jaźń', 'ćwiczenia rano']);

  const notes = async (q: string) => (await journal.entries.searchEntries(q, [])).map((e) => e.note);

  assert.deepEqual(await notes('lozko'), ['spałem w łóżko']);
  assert.deepEqual(await notes('zazolc'), ['zażółć gęślą jaźń']);
  assert.deepEqual(await notes('cwiczenia'), ['ćwiczenia rano']);
  // Symmetric: typing the accented form finds it too, because both sides fold.
  assert.deepEqual(await notes('ŁÓŻKO'), ['spałem w łóżko']);
  assert.deepEqual(await notes('gęślą'), ['zażółć gęślą jaźń']);
});

test('a partial word finds the entry it starts', async () => {
  const { journal } = await journalWithNotes(['Coffee with Marta', 'ćwiczenia rano']);

  const notes = async (q: string) => (await journal.entries.searchEntries(q, [])).map((e) => e.note);

  assert.deepEqual(await notes('cof'), ['Coffee with Marta']);
  assert.deepEqual(await notes('cwicz'), ['ćwiczenia rano']);
  assert.deepEqual(await notes('coffee mar'), ['Coffee with Marta']);
});

test('every word has to appear somewhere in the note', async () => {
  const { journal } = await journalWithNotes(['Coffee with Marta', 'Coffee alone']);

  assert.deepEqual((await journal.entries.searchEntries('coffee marta', [])).map((e) => e.note), [
    'Coffee with Marta'
  ]);
});

test('results come back newest first, by day then by time within the day', async () => {
  const { journal } = await journalWithBuiltIns();
  await journal.entries.upsertEntry({ epochDay: 100, timestamp: 5, note: 'kawa oldest' });
  await journal.entries.upsertEntry({ epochDay: 200, timestamp: 1, note: 'kawa earlier that day' });
  await journal.entries.upsertEntry({ epochDay: 200, timestamp: 9, note: 'kawa later that day' });

  const hits = await journal.entries.searchEntries('kawa', []);
  assert.deepEqual(
    hits.map((e) => e.note),
    ['kawa later that day', 'kawa earlier that day', 'kawa oldest']
  );
});

test('a query with nothing searchable in it returns nothing', async () => {
  const { journal } = await journalWithNotes(['Coffee with Marta']);

  for (const q of ['', '   ', '...', '*']) {
    assert.deepEqual(await journal.entries.searchEntries(q, []), [], JSON.stringify(q));
  }
});

test('typed FTS5 syntax is searched for as words rather than obeyed or thrown', async () => {
  const { journal } = await journalWithNotes(['Coffee with Marta', 'the OR keyword']);

  const notes = async (q: string) => (await journal.entries.searchEntries(q, [])).map((e) => e.note);

  // Were the operator honoured, this would return both notes.
  assert.deepEqual(await notes('coffee OR keyword'), []);
  assert.deepEqual(await notes('or keyword'), ['the OR keyword']);
  assert.deepEqual(await notes('"'), []);
  assert.deepEqual(await notes('marta*'), ['Coffee with Marta']);
});

test('entries carrying a matched tag come back alongside the note matches', async () => {
  // The caller resolves labels to ids above this seam (ADR-0016: a built-in
  // tag stores a key, and turning keys into words needs paraglide, which the
  // journal cannot import).
  const { journal } = await journalWithBuiltIns();
  const tagged = await journal.entries.upsertEntry({ epochDay: 100, tags: ['e-happy'] });
  const noted = await journal.entries.upsertEntry({ epochDay: 101, note: 'a happy note' });

  const hits = await journal.entries.searchEntries('happy', ['e-happy']);
  assert.deepEqual(
    hits.map((e) => e.id),
    [noted, tagged]
  );
});

test('an entry matching both its note and a tag appears once', async () => {
  const { journal } = await journalWithBuiltIns();
  const id = await journal.entries.upsertEntry({ epochDay: 100, note: 'feeling happy', tags: ['e-happy'] });

  const hits = await journal.entries.searchEntries('happy', ['e-happy']);
  assert.deepEqual(
    hits.map((e) => e.id),
    [id]
  );
});

test('a tag match stands on its own when the query matches no note', async () => {
  const { journal } = await journalWithBuiltIns();
  const id = await journal.entries.upsertEntry({ epochDay: 100, tags: ['e-hopeful'] });

  const hits = await journal.entries.searchEntries('hopeful', ['e-hopeful']);
  assert.deepEqual(
    hits.map((e) => e.id),
    [id]
  );
});

test('a custom tag matches by uuid, the way a built-in matches by key', async () => {
  const { journal } = await journalWithBuiltIns();
  const tag = await journal.tags.addTag('emotions', 'zażółć');
  const id = await journal.entries.upsertEntry({ epochDay: 100, tags: [tag.id] });

  assert.deepEqual((await journal.entries.searchEntries('zazolc', [tag.id])).map((e) => e.id), [id]);
});

test('tag ids alone still search when the query itself has no searchable text', async () => {
  // The half that has no work to do has to be left out of the SQL, not left
  // in and disarmed: an empty FTS5 expression is a syntax error, so building
  // this query with both halves always present throws here.
  const { journal } = await journalWithBuiltIns();
  const id = await journal.entries.upsertEntry({ epochDay: 100, tags: ['e-happy'] });

  assert.deepEqual((await journal.entries.searchEntries('...', ['e-happy'])).map((e) => e.id), [id]);
});

test('editing a note replaces what search finds, leaving nothing of the old text', async () => {
  const { journal } = await journalWithBuiltIns();
  const id = await journal.entries.upsertEntry({ epochDay: 100, note: 'spałem w łóżko' });

  await journal.entries.upsertEntry({ id, note: 'ćwiczenia rano' });

  assert.deepEqual(await journal.entries.searchEntries('lozko', []), []);
  assert.deepEqual((await journal.entries.searchEntries('cwiczenia', [])).map((e) => e.id), [id]);
});

test('an edit that leaves the note alone keeps it findable', async () => {
  // upsertEntry takes a partial: changing only the mood must not blank the
  // indexed text, the way passing note: undefined through a naive reindex would.
  const { journal } = await journalWithBuiltIns();
  const id = await journal.entries.upsertEntry({ epochDay: 100, note: 'spałem w łóżko' });

  await journal.entries.upsertEntry({ id, mood: 5 });

  assert.deepEqual((await journal.entries.searchEntries('lozko', [])).map((e) => e.id), [id]);
});

test('a deleted entry stops being findable', async () => {
  const { journal } = await journalWithBuiltIns();
  const id = await journal.entries.upsertEntry({ epochDay: 100, note: 'spałem w łóżko' });

  await journal.entries.deleteEntry(id);

  assert.deepEqual(await journal.entries.searchEntries('lozko', []), []);
});

test('the index holds one row per entry, so a reused rowid cannot inherit old text', async () => {
  // AUTOINCREMENT makes rowid reuse unlikely rather than impossible, and a
  // stale index row would surface as a hit joined to the wrong entry.
  const { journal, db } = await journalWithBuiltIns();
  const id = await journal.entries.upsertEntry({ epochDay: 100, note: 'spałem w łóżko' });
  await journal.entries.upsertEntry({ id, note: 'ćwiczenia rano' });

  const rows = db.raw.prepare('SELECT COUNT(*) AS n FROM entry_fts').get() as { n: number };
  assert.equal(rows.n, 1);
});

test('an entry with no note is searchable by tag but contributes no note text', async () => {
  const { journal } = await journalWithBuiltIns();
  const id = await journal.entries.upsertEntry({ epochDay: 100, mood: 3, tags: ['e-happy'] });

  assert.deepEqual((await journal.entries.searchEntries('happy', ['e-happy'])).map((e) => e.id), [id]);
  assert.deepEqual(await journal.entries.searchEntries('happy', []), []);
});
