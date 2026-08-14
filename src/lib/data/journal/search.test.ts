/* Search (ticket 09, ADR-0005, PRD F19). The cases that carry this module
   are the Polish ones: ł has no Unicode decomposition, so FTS5's own
   remove_diacritics cannot reach it and the fold has to happen in app code
   on both sides of the index. If these pass, the reason the fold exists is
   still true. */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { fakeFileStore } from '../photos/test-support/fake-file-store.ts';
import { migratedDb } from '../sqlite/test-support/migrated-db.ts';
import { openJournal } from './journal.ts';
import { countingDriver, journalWithBuiltIns } from './test-support.ts';

/** Notes land on distinct days so newest-first is unambiguous. `found` is the
    note text of the hits, which is what most of these tests assert on. */
async function journalWithNotes(notes: string[]) {
  const { journal, db } = await journalWithBuiltIns();
  const ids: number[] = [];
  for (const [i, note] of notes.entries()) {
    ids.push(await journal.entries.upsertEntry({ epochDay: 100 + i, mood: 3, note }));
  }
  const found = async (query: string) => (await journal.entries.searchEntries(query, [])).map((e) => e.note);
  return { journal, db, ids, found };
}

test('a folded query finds text the fold reaches but FTS5 alone cannot', async () => {
  const { found } = await journalWithNotes(['spałem w łóżko', 'zażółć gęślą jaźń', 'ćwiczenia rano']);

  assert.deepEqual(await found('lozko'), ['spałem w łóżko']);
  assert.deepEqual(await found('zazolc'), ['zażółć gęślą jaźń']);
  assert.deepEqual(await found('cwiczenia'), ['ćwiczenia rano']);
  // Symmetric: typing the accented form finds it too, because both sides fold.
  assert.deepEqual(await found('ŁÓŻKO'), ['spałem w łóżko']);
  assert.deepEqual(await found('gęślą'), ['zażółć gęślą jaźń']);
});

test('a word the fold does not cover is still found, by FTS5 folding it', async () => {
  /* The fold and FTS5's tokenizer each cover letters the other does not, and
     the query has to survive both. ü is not in the fold, so it reaches the
     index intact and unicode61 folds it to u there; the query has to arrive
     as one token for the same thing to happen on its side. */
  const { found } = await journalWithNotes(['Müller kupił bilet', 'naïve idea']);

  assert.deepEqual(await found('Müller'), ['Müller kupił bilet']);
  assert.deepEqual(await found('muller'), ['Müller kupił bilet']);
  assert.deepEqual(await found('naïve'), ['naïve idea']);
  assert.deepEqual(await found('naive'), ['naïve idea']);
  // And the fold still does the half FTS5 cannot, in the same note.
  assert.deepEqual(await found('kupil'), ['Müller kupił bilet']);
});

test('a partial word finds the entry it starts', async () => {
  const { found } = await journalWithNotes(['Coffee with Marta', 'ćwiczenia rano']);

  assert.deepEqual(await found('cof'), ['Coffee with Marta']);
  assert.deepEqual(await found('cwicz'), ['ćwiczenia rano']);
  assert.deepEqual(await found('coffee mar'), ['Coffee with Marta']);
});

test('every word has to appear somewhere in the note', async () => {
  const { found } = await journalWithNotes(['Coffee with Marta', 'Coffee alone']);

  assert.deepEqual(await found('coffee marta'), ['Coffee with Marta']);
});

test('results come back newest first, by day then by time within the day', async () => {
  const { journal } = await journalWithBuiltIns();
  await journal.entries.upsertEntry({ epochDay: 100, timestamp: 5, mood: 3, note: 'kawa oldest' });
  await journal.entries.upsertEntry({ epochDay: 200, timestamp: 1, mood: 3, note: 'kawa earlier that day' });
  await journal.entries.upsertEntry({ epochDay: 200, timestamp: 9, mood: 3, note: 'kawa later that day' });

  const hits = await journal.entries.searchEntries('kawa', []);
  assert.deepEqual(
    hits.map((e) => e.note),
    ['kawa later that day', 'kawa earlier that day', 'kawa oldest']
  );
});

test('a query with nothing searchable in it returns nothing', async () => {
  const { found } = await journalWithNotes(['Coffee with Marta']);

  for (const q of ['', '   ', '...', '*']) {
    assert.deepEqual(await found(q), [], JSON.stringify(q));
  }
});

test('typed FTS5 syntax is searched for as words rather than obeyed or thrown', async () => {
  const { found } = await journalWithNotes(['Coffee with Marta', 'the OR keyword']);

  // Were the operator honoured, this would return both notes.
  assert.deepEqual(await found('coffee OR keyword'), []);
  assert.deepEqual(await found('or keyword'), ['the OR keyword']);
  assert.deepEqual(await found('"'), []);
  assert.deepEqual(await found('marta*'), ['Coffee with Marta']);
});

test('entries carrying a matched tag come back alongside the note matches', async () => {
  const { journal } = await journalWithBuiltIns();
  const tagged = await journal.entries.upsertEntry({ epochDay: 100, mood: 3, tags: ['e-happy'] });
  const noted = await journal.entries.upsertEntry({ epochDay: 101, mood: 3, note: 'a happy note' });

  const hits = await journal.entries.searchEntries('happy', ['e-happy']);
  assert.deepEqual(
    hits.map((e) => e.id),
    [noted, tagged]
  );
});

test('an entry matching both its note and a tag appears once', async () => {
  const { journal } = await journalWithBuiltIns();
  const id = await journal.entries.upsertEntry({ epochDay: 100, mood: 3, note: 'feeling happy', tags: ['e-happy'] });

  const hits = await journal.entries.searchEntries('happy', ['e-happy']);
  assert.deepEqual(
    hits.map((e) => e.id),
    [id]
  );
});

test('a tag match stands on its own when the query matches no note', async () => {
  const { journal } = await journalWithBuiltIns();
  const id = await journal.entries.upsertEntry({ epochDay: 100, mood: 3, tags: ['e-hopeful'] });

  const hits = await journal.entries.searchEntries('hopeful', ['e-hopeful']);
  assert.deepEqual(
    hits.map((e) => e.id),
    [id]
  );
});

test('a custom tag matches by uuid, the way a built-in matches by key', async () => {
  const { journal } = await journalWithBuiltIns();
  const tag = await journal.tags.addTag('emotions', 'zażółć');
  const id = await journal.entries.upsertEntry({ epochDay: 100, mood: 3, tags: [tag.id] });

  assert.deepEqual((await journal.entries.searchEntries('zazolc', [tag.id])).map((e) => e.id), [id]);
});

test('tag ids alone still search when the query itself has no searchable text', async () => {
  // The half that has no work to do has to be left out of the SQL, not left
  // in and disarmed: an empty FTS5 expression is a syntax error, so building
  // this query with both halves always present throws here.
  const { journal } = await journalWithBuiltIns();
  const id = await journal.entries.upsertEntry({ epochDay: 100, mood: 3, tags: ['e-happy'] });

  assert.deepEqual((await journal.entries.searchEntries('...', ['e-happy'])).map((e) => e.id), [id]);
});

test('editing a note replaces what search finds, leaving nothing of the old text', async () => {
  const { journal } = await journalWithBuiltIns();
  const id = await journal.entries.upsertEntry({ epochDay: 100, mood: 3, note: 'spałem w łóżko' });

  await journal.entries.upsertEntry({ id, note: 'ćwiczenia rano' });

  assert.deepEqual(await journal.entries.searchEntries('lozko', []), []);
  assert.deepEqual((await journal.entries.searchEntries('cwiczenia', [])).map((e) => e.id), [id]);
});

test('an edit that leaves the note alone keeps it findable', async () => {
  // upsertEntry takes a partial: changing only the mood must not blank the
  // indexed text, the way passing note: undefined through a naive reindex would.
  const { journal } = await journalWithBuiltIns();
  const id = await journal.entries.upsertEntry({ epochDay: 100, mood: 3, note: 'spałem w łóżko' });

  await journal.entries.upsertEntry({ id, mood: 5 });

  assert.deepEqual((await journal.entries.searchEntries('lozko', [])).map((e) => e.id), [id]);
});

test('a deleted entry stops being findable', async () => {
  const { journal } = await journalWithBuiltIns();
  const id = await journal.entries.upsertEntry({ epochDay: 100, mood: 3, note: 'spałem w łóżko' });

  await journal.entries.deleteEntry(id);

  assert.deepEqual(await journal.entries.searchEntries('lozko', []), []);
});

test('the index holds one row per entry, so a reused rowid cannot inherit old text', async () => {
  // AUTOINCREMENT makes rowid reuse unlikely rather than impossible, and a
  // stale index row would surface as a hit joined to the wrong entry.
  const { journal, db } = await journalWithBuiltIns();
  const id = await journal.entries.upsertEntry({ epochDay: 100, mood: 3, note: 'spałem w łóżko' });
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

test('structured filters can search without typed text', async () => {
  const { journal, db } = await journalWithBuiltIns();
  const noNote = await journal.entries.upsertEntry({ epochDay: 100, mood: 1, tags: ['e-happy'] });
  const withNote = await journal.entries.upsertEntry({ epochDay: 101, mood: 2, note: 'voice changed' });
  const withPhoto = await journal.entries.upsertEntry({ epochDay: 102, mood: 4 });
  db.raw
    .prepare("INSERT INTO photo (uuid, entry_id, file_path, updated_at) VALUES ('filter-photo', ?, 'p.jpg', 0)")
    .run(withPhoto);

  assert.deepEqual((await journal.entries.searchEntries('', [], { hasNote: true })).map((e) => e.id), [withNote]);
  assert.deepEqual((await journal.entries.searchEntries('', [], { hasPhoto: true })).map((e) => e.id), [withPhoto]);
  assert.deepEqual((await journal.entries.searchEntries('', [], { tagIds: ['e-happy'] })).map((e) => e.id), [noNote]);
});

test('within-category OR and across-category AND hold for tag and mood filters', async () => {
  const { journal } = await journalWithBuiltIns();
  const a = await journal.entries.upsertEntry({ epochDay: 100, mood: 1, tags: ['e-happy'] });
  await journal.entries.upsertEntry({ epochDay: 101, mood: 4, tags: ['e-happy'] });
  const c = await journal.entries.upsertEntry({ epochDay: 102, mood: 5, tags: ['e-sad'] });
  await journal.entries.upsertEntry({ epochDay: 103, mood: 5, tags: ['e-calm'] });

  const hits = await journal.entries.searchEntries('', [], { tagIds: ['e-happy', 'e-sad'], moods: [1, 5] });
  assert.deepEqual(
    hits.map((e) => e.id),
    [c, a]
  );
});

test('open-ended date boundaries are inclusive', async () => {
  const { journal } = await journalWithBuiltIns();
  const day100 = await journal.entries.upsertEntry({ epochDay: 100, mood: 3, note: 'd100' });
  const day101 = await journal.entries.upsertEntry({ epochDay: 101, mood: 3, note: 'd101' });
  const day102 = await journal.entries.upsertEntry({ epochDay: 102, mood: 3, note: 'd102' });

  assert.deepEqual(
    (await journal.entries.searchEntries('', [], { startEpochDay: 101 })).map((e) => e.id),
    [day102, day101]
  );
  assert.deepEqual(
    (await journal.entries.searchEntries('', [], { endEpochDay: 101 })).map((e) => e.id),
    [day101, day100]
  );
});

test('text and structured filters combine with AND semantics', async () => {
  const { journal } = await journalWithBuiltIns();
  const matching = await journal.entries.upsertEntry({ epochDay: 100, mood: 5, note: 'coffee with Marta' });
  await journal.entries.upsertEntry({ epochDay: 101, mood: 2, note: 'coffee with Ola' });
  await journal.entries.upsertEntry({ epochDay: 102, mood: 5, note: 'tea with Marta' });

  const hits = await journal.entries.searchEntries('coffee', [], { moods: [5] });
  assert.deepEqual(
    hits.map((e) => e.id),
    [matching]
  );
});

test('pagination and total count stay accurate with structured filters', async () => {
  const { journal, db } = await journalWithBuiltIns();
  const ids: number[] = [];
  for (const day of [100, 101, 102]) {
    const id = await journal.entries.upsertEntry({ epochDay: day, mood: 4, note: 'coffee with Marta' });
    db.raw
      .prepare('INSERT INTO photo (uuid, entry_id, file_path, updated_at) VALUES (?, ?, ?, 0)')
      .run(`p-${day}`, id, `${day}.jpg`);
    ids.push(id);
  }

  const page = await journal.entries.searchEntries('coffee', [], { hasPhoto: true }, 2);
  const total = await journal.entries.countSearchMatches('coffee', [], { hasPhoto: true });

  assert.deepEqual(
    page.map((e) => e.id),
    [ids[2], ids[1]]
  );
  assert.equal(total, 3);
});

/* Round trips, not milliseconds (ticket 07). Every driver call is one
   serialized bridge crossing on Android (android-driver.ts), and a crossing
   costs tens of milliseconds whatever the SQL behind it does - so what makes
   search slow on a real phone is how many calls a page of hits takes, and
   that is a number the Node tier can hold to account. Counting them here
   catches a hydration regression in a second, where noticing it on the
   device costs a half-hour benchmark run. */
async function countingJournal() {
  const db = await migratedDb();
  const counting = countingDriver(db);
  const journal = openJournal(counting.driver, fakeFileStore());
  await journal.reconcileBuiltIns();
  return {
    journal,
    db,
    roundTrips: () => counting.roundTrips().query,
    reset: counting.resetRoundTrips
  };
}

test('a page of search costs the same round trips however many hits it holds', async () => {
  const { journal, db, roundTrips, reset } = await countingJournal();
  for (let i = 0; i < 40; i += 1) {
    const id = await journal.entries.upsertEntry({
      epochDay: 100 + i,
      mood: 3,
      note: 'coffee with Marta',
      tags: ['e-happy', 'e-calm'],
      dims: { femininity: 4 }
    });
    db.raw
      .prepare('INSERT INTO photo (uuid, entry_id, file_path, updated_at) VALUES (?, ?, ?, 0)')
      .run(`p-${i}`, id, `${i}.jpg`);
  }

  reset();
  const ten = await journal.entries.searchEntries('coffee', [], 10);
  const forTen = roundTrips();

  reset();
  const thirty = await journal.entries.searchEntries('coffee', [], 30);
  const forThirty = roundTrips();

  assert.equal(ten.length, 10);
  assert.equal(thirty.length, 30);
  assert.equal(
    forThirty,
    forTen,
    `a 30-hit page took ${forThirty} round trips and a 10-hit page ${forTen}: hydration is per-row`
  );
});
