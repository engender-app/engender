/* The search registry (phase 5 deepening ticket 24): which areas hold text,
   that each area's declaration matches the table it names, that a folded
   query reaches all of them, and that searching writes nothing.

   What each area's text *means* is not tested here - that is each area's own
   test file. This is the registry, and the reach. */

import assert from 'node:assert/strict';
import { test } from 'vitest';
import { startOfDayTimestamp } from '../epochDay.ts';
import { fakeFileStore } from '../photos/test-support/fake-file-store.ts';
import { migratedDb } from '../sqlite/test-support/migrated-db.ts';
import { ARCHIVE_SECTION_NAMES } from './archiveSections.ts';
import { openJournal, type Journal } from './journal.ts';
import { countingDriver, journalWithBuiltIns } from './test-support.ts';
import {
  makeTextSearchArea,
  SEARCH_AREAS,
  SEARCH_AREA_KEYS,
  SEARCH_OPT_OUTS,
  SEARCH_TABLES,
  type SearchHit
} from './textSearch.ts';

const DAY = 20000;
const TODAY = DAY + 10;

// --- the registry -------------------------------------------------------

test('every area that travels either holds searchable text or says why it does not', () => {
  const covered = new Set<string>(SEARCH_AREAS.flatMap((a) => a.covers));
  const optedOut = new Set(Object.keys(SEARCH_OPT_OUTS));

  for (const name of ARCHIVE_SECTION_NAMES) {
    assert.ok(
      covered.has(name) || optedOut.has(name),
      `${name} is registered nowhere: give it a search area, or a reason in SEARCH_OPT_OUTS`
    );
  }
});

test('nothing is both registered and opted out, and no opt-out names an area that no longer travels', () => {
  const travelling = new Set<string>(ARCHIVE_SECTION_NAMES);
  const covered = new Set<string>(SEARCH_AREAS.flatMap((a) => a.covers));

  for (const [name, reason] of Object.entries(SEARCH_OPT_OUTS) as [string, string][]) {
    assert.ok(travelling.has(name), `SEARCH_OPT_OUTS names ${name}, which is not an archive section any more`);
    assert.ok(!covered.has(name), `${name} is both registered and opted out`);
    assert.ok(reason.length > 0, `${name} is opted out with no reason`);
  }
});

test('a registry short of an area fails the coverage rule the real one passes', () => {
  /* The check above is only worth having if it can fail, and over the real
     registry it never does. So it is driven again over a registry with one
     area taken out: the same rule, the same opt-out list, and the area that
     one covered is now accounted for nowhere. */
  const withoutLetters = SEARCH_AREAS.filter((a) => !a.covers.includes('letters'));
  const covered = new Set<string>(withoutLetters.flatMap((a) => a.covers));
  const optedOut = new Set(Object.keys(SEARCH_OPT_OUTS));

  const unaccounted = ARCHIVE_SECTION_NAMES.filter((name) => !covered.has(name) && !optedOut.has(name));

  assert.deepEqual(unaccounted, ['letters']);
});

test('every declared column is a real TEXT column of the table the area names', async () => {
  /* A misspelled column would fail loudly the first time somebody searched,
     which is a worse place to find out than here - and a column that exists
     but holds a number would match nothing and look like an area with no
     text in it. Read off the migrated schema rather than a list kept here,
     so a renamed column fails this without anybody remembering to. */
  const db = await migratedDb();

  for (const area of SEARCH_AREAS) {
    for (const declared of [...area.columns, area.uuid, ...(area.context ? [area.context] : [])]) {
      /* `context` is a real column everywhere but marginNotes, whose owner
         has no TEXT identity to point a hit's href at - an entry's domain
         id is its rowid (ADR-0002), and the only TEXT column it owns is a
         uuid nothing in the app navigates local routes by. `CAST(x AS
         TEXT)` is SQLite's own way to say "this is text on the way out
         regardless of what it is stored as", so the assertion below moves
         to the column the cast wraps, and to a coarser one: that it exists,
         not that it was already TEXT - a cast onto a column already TEXT
         would be pointless and a real typo inside one still fails loudly. */
      const cast = declared.match(/^CAST\(([a-zA-Z_]+)\.([a-zA-Z_]+) AS TEXT\)$/);
      const [prefix, bare] = cast
        ? [cast[1], cast[2]]
        : declared.includes('.')
          ? declared.split('.')
          : [null, declared];
      const table = prefix === null ? area.from : tableForAlias(area.from, prefix);
      const columns = (await db.query<{ name: string; type: string }>(`PRAGMA table_info(${table})`)).map((c) => c);
      const column = columns.find((c) => c.name === bare);
      if (cast) {
        assert.ok(column, `${area.key} declares ${declared}, which ${table} does not have`);
        continue;
      }
      assert.ok(column, `${area.key} declares ${declared}, which ${table} does not have`);
      assert.equal(column.type, 'TEXT', `${area.key} declares ${declared}, which is not a TEXT column`);
    }
  }
});

/** Which table an alias in a FROM clause stands for: `letter` for a bare
    table, `checklist_item` for `checklist_item ci JOIN ...`. Deliberately
    small - it understands the two shapes the registry actually writes, and
    throws rather than guessing on anything else. */
function tableForAlias(from: string, alias: string): string {
  const pairs = from
    .split(/\bJOIN\b|\bLEFT JOIN\b/)
    .map((part) => part.trim().split(/\s+ON\s+/)[0].trim().split(/\s+/))
    .filter((words) => words.length === 2);
  const match = pairs.find(([, name]) => name === alias);
  if (!match) throw new Error(`no table aliased ${alias} in FROM ${from}`);
  return match[0];
}

test('the live layer depends on every table the registry reads', () => {
  for (const area of SEARCH_AREAS) {
    for (const table of area.tables) {
      assert.ok(SEARCH_TABLES.includes(table), `${area.key} reads ${table}, which search does not depend on`);
    }
  }
  assert.equal(SEARCH_TABLES.length, new Set(SEARCH_TABLES).size, 'SEARCH_TABLES repeats a table');
  assert.deepEqual([...SEARCH_AREA_KEYS], SEARCH_AREAS.map((a) => a.key));
});

// --- the query ----------------------------------------------------------

test('a query with nothing searchable in it never goes to the database', async () => {
  const db = await migratedDb();
  const { driver, roundTrips } = countingDriver(db);
  const search = makeTextSearchArea(driver);

  for (const query of ['', '   ', '%', '__', '...']) {
    const results = await search.search({ query, today: TODAY, limit: 30 });
    assert.deepEqual(results.hits, []);
  }
  assert.equal(roundTrips().query, 0);
});

test('a typed % or _ is a character to find rather than a wildcard', async () => {
  const { journal } = await journalWithBuiltIns();
  await journal.milestones.upsertMilestone({ name: '100% mine', epochDay: DAY });
  await journal.milestones.upsertMilestone({ name: 'first appointment', epochDay: DAY });

  assert.deepEqual(await found(journal, '100%'), ['100% mine']);
  // Without escaping this would match every milestone there is.
  assert.deepEqual(await found(journal, '%'), []);
});

/** Every hit's matched text for one query, which is what most of these
    assert on. */
async function found(journal: Journal, query: string, limit = 30): Promise<string[]> {
  const results = await journal.textSearch.search({ query, today: TODAY, limit });
  return results.hits.map((hit) => hit.value);
}

/** Every hit's area for one query, in the order they came back. */
async function areasFound(journal: Journal, query: string): Promise<string[]> {
  const results = await journal.textSearch.search({ query, today: TODAY, limit: 100 });
  return results.hits.map((hit) => hit.area);
}

test('one word reaches every registered area, folded on both sides', async () => {
  const { journal } = await journalWithBuiltIns();
  await fillEveryTextArea(journal);

  /* The word is written into every area in its Polish spelling and typed
     here without diacritics, which is ADR-0005's guarantee holding on the
     scanned side of the app as well as in the index. */
  const areas = await areasFound(journal, 'zolc');
  for (const key of SEARCH_AREA_KEYS) {
    assert.ok(areas.includes(key), `nothing in ${key} was found, though the fixture wrote the word into it`);
  }
});

/* Phase 8 features ticket 52, ADR-0065: "Search finds a document by the
   title the person wrote and by nothing else." The registry's own
   `one word reaches every registered area` test covers the positive half;
   this is the negative one, and it is the half the ADR is actually about -
   the app never reads a document, so neither its stored file nor its
   travelling id may be a way to find it. */
test('a document is found by its title and by neither its file nor its id', async () => {
  const { journal } = await journalWithBuiltIns();
  const id = await journal.documents.addDocument(
    { epochDay: DAY, title: 'Opinia psychiatryczna' },
    { full: new Uint8Array([1]), thumb: new Uint8Array([2]) }
  );
  const { fileName } = (await journal.documents.getDocument(id))!;

  assert.deepEqual(await areasFound(journal, 'psychiatryczna'), ['documents']);
  assert.deepEqual(await areasFound(journal, fileName), []);
  assert.deepEqual(await areasFound(journal, fileName.replace('.jpg', '')), []);
  assert.deepEqual(await areasFound(journal, id), []);
});

test('a hit carries its area, its record and its day', async () => {
  const { journal } = await journalWithBuiltIns();
  const letterId = await journal.letters.addLetter({ epochDay: DAY, text: 'żółć w środku', unlockEpochDay: DAY });

  const results = await journal.textSearch.search({ query: 'zolc', today: TODAY, limit: 30 });
  assert.deepEqual(results.hits, [
    { area: 'letters', id: letterId, epochDay: DAY, value: 'żółć w środku', context: null }
  ] satisfies SearchHit[]);
});

test('a sealed letter is not searchable, and the day it unlocks it becomes so', async () => {
  const { journal } = await journalWithBuiltIns();
  await journal.letters.addLetter({ epochDay: DAY, text: 'sealed żółć', unlockEpochDay: TODAY + 1 });
  await journal.letters.addLetter({ epochDay: DAY, text: 'open żółć', unlockEpochDay: TODAY });

  assert.deepEqual(await found(journal, 'zolc'), ['open żółć']);

  const later = await journal.textSearch.search({ query: 'zolc', today: TODAY + 1, limit: 30 });
  assert.deepEqual(later.hits.map((hit) => hit.value).sort(), ['open żółć', 'sealed żółć']);
});

test('hits come back newest first, with the undated ones last', async () => {
  const { journal } = await journalWithBuiltIns();
  await journal.milestones.upsertMilestone({ name: 'older żółć', epochDay: DAY - 5 });
  await journal.milestones.upsertMilestone({ name: 'newer żółć', epochDay: DAY });
  await journal.roadmap.addCustomGoal('legal', 'undated żółć');

  assert.deepEqual(await found(journal, 'zolc'), ['newer żółć', 'older żółć', 'undated żółć']);
});

test('the date range narrows dated areas and leaves undated ones alone', async () => {
  const { journal } = await journalWithBuiltIns();
  await journal.milestones.upsertMilestone({ name: 'inside żółć', epochDay: DAY });
  await journal.milestones.upsertMilestone({ name: 'before żółć', epochDay: DAY - 30 });
  await journal.roadmap.addCustomGoal('legal', 'undated żółć');

  const results = await journal.textSearch.search({
    query: 'zolc',
    today: TODAY,
    startEpochDay: DAY - 1,
    endEpochDay: DAY + 1,
    limit: 30
  });
  assert.deepEqual(results.hits.map((hit) => hit.value), ['inside żółć', 'undated żółć']);
});

test('a wear session is dated by the day its session started, and the range reaches it', async () => {
  const { journal } = await journalWithBuiltIns();
  await journal.wearSessions.upsertSession({
    kind: 'binder',
    startTimestamp: startOfDayTimestamp(DAY) + 20 * 3_600_000,
    durationMs: 3_600_000,
    note: 'żółć under a shirt'
  });

  const inside = await journal.textSearch.search({
    query: 'zolc',
    today: TODAY,
    startEpochDay: DAY,
    endEpochDay: DAY,
    limit: 30
  });
  assert.deepEqual(inside.hits.map((hit) => hit.epochDay), [DAY]);

  const outside = await journal.textSearch.search({
    query: 'zolc',
    today: TODAY,
    startEpochDay: DAY + 1,
    endEpochDay: DAY + 2,
    limit: 30
  });
  assert.deepEqual(outside.hits, []);
});

test('a row that matched on two of its columns shows the one its area prefers', async () => {
  const { journal } = await journalWithBuiltIns();
  await journal.procedures.upsertProcedure({ name: 'żółć journey', notes: 'żółć again in the notes' });

  assert.deepEqual(await found(journal, 'zolc'), ['żółć journey']);
});

test('a Cyrillic word in a scanned area is found however either side was capitalised', async () => {
  /* Phase 8 features ticket 49 item 4, the non-entry half - and the half
     that was genuinely broken. An entry note goes through `foldText` in JS
     on both sides, where `toLowerCase()` handles Cyrillic; a milestone name
     is matched by `foldedSql` inside SQL, and SQLite's `lower()` maps A-Z
     and nothing else. So `Настя` stayed capitalised in the column while
     `настя` was folded on the query side, and the two never met. Anyone
     keeping this journal in Russian or Ukrainian could not find a name they
     had written down. */
  const { journal } = await journalWithBuiltIns();
  await journal.milestones.upsertMilestone({ name: 'Настя', epochDay: DAY });
  await journal.milestones.upsertMilestone({ name: 'Ґалаґан', epochDay: DAY });

  assert.deepEqual(await found(journal, 'настя'), ['Настя']);
  assert.deepEqual(await found(journal, 'НАСТЯ'), ['Настя']);
  assert.deepEqual(await found(journal, 'ґалаґан'), ['Ґалаґан']);
});

test('a milestone matches on its description when its name does not', async () => {
  const { journal } = await journalWithBuiltIns();
  await journal.milestones.upsertMilestone({
    name: 'first laser session',
    epochDay: DAY,
    description: 'żółć, cried a little after'
  });

  assert.deepEqual(await found(journal, 'zolc'), ['żółć, cried a little after']);
});

test('a milestone that matches on both name and description shows its name', async () => {
  const { journal } = await journalWithBuiltIns();
  await journal.milestones.upsertMilestone({
    name: 'żółć day',
    epochDay: DAY,
    description: 'żółć again in the description'
  });

  assert.deepEqual(await found(journal, 'zolc'), ['żółć day']);
});

test('a felt sense carries the tryout it belongs to, and a milestone one carries nothing', async () => {
  const { journal } = await journalWithBuiltIns();
  const tryoutId = await journal.tryouts.upsertTryout({ kind: 'name', label: 'Marta', startEpochDay: DAY, endEpochDay: null });
  await journal.feltSense.add({ tryoutId }, { epochDay: DAY, mood: 4, note: 'żółć one' });
  const milestoneId = await journal.milestones.upsertMilestone({ name: 'first day', epochDay: DAY });
  await journal.feltSense.add({ milestoneId }, { epochDay: DAY, mood: 4, note: 'żółć two' });

  const results = await journal.textSearch.search({ query: 'zolc', today: TODAY, limit: 30 });
  const contexts = new Map(results.hits.map((hit) => [hit.value, hit.context]));
  assert.equal(contexts.get('żółć one'), tryoutId);
  assert.equal(contexts.get('żółć two'), null);
});

test('the limit bounds the page, and the count is of every match', async () => {
  const { journal } = await journalWithBuiltIns();
  for (let i = 0; i < 5; i++) await journal.milestones.upsertMilestone({ name: `żółć ${i}`, epochDay: DAY - i });

  const page = await journal.textSearch.search({ query: 'zolc', today: TODAY, limit: 3 });
  assert.equal(page.hits.length, 3);
  // The count is of everything that matched, not of the page.
  assert.equal(page.total, 5);

  const all = await journal.textSearch.search({ query: 'zolc', today: TODAY, limit: 5 });
  assert.equal(all.hits.length, 5);
  assert.equal(all.total, 5);
});

test('a search is two round trips, whatever the registry grows to', async () => {
  const db = await migratedDb();
  const { driver, roundTrips, resetRoundTrips } = countingDriver(db);
  const journal = openJournal(driver, fakeFileStore());
  await journal.reconcileBuiltIns();
  await fillEveryTextArea(journal);

  resetRoundTrips();
  await journal.textSearch.search({ query: 'zolc', today: TODAY, limit: 30 });
  // The page and the count, and nothing per area.
  assert.deepEqual(roundTrips(), { query: 2, run: 0 });
});

test('searching writes nothing', async () => {
  const db = await migratedDb();
  const statements: string[] = [];
  const { driver } = countingDriver(db, { onRun: (sql) => statements.push(sql) });
  const journal = openJournal(driver, fakeFileStore());
  await journal.reconcileBuiltIns();
  await fillEveryTextArea(journal);

  statements.length = 0;
  await journal.textSearch.search({ query: 'zolc', today: TODAY, limit: 30 });
  await journal.textSearch.search({ query: 'nothing matches this', today: TODAY, limit: 30 });
  assert.deepEqual(statements, []);
});

/** One record carrying the same word in every registered area, so "does
    search reach it" is a question about the registry rather than about
    eighteen fixtures. Written through each area's own write path, so a
    declaration that names a column the area does not actually fill fails
    here. */
async function fillEveryTextArea(journal: Journal): Promise<void> {
  const word = 'żółć';

  await journal.letters.addLetter({ epochDay: DAY, text: `letter ${word}`, unlockEpochDay: DAY });
  const marginEntryId = await journal.entries.upsertEntry({ epochDay: DAY, mood: 3, note: 'plain entry note' });
  await journal.marginNotes.add({ entryId: marginEntryId, epochDay: DAY, text: `margin ${word}` });
  await journal.presentations.addPresentation(`presentation ${word}`, 0);
  await journal.eras.upsertEra({ name: `era ${word}`, startEpochDay: DAY, endEpochDay: null });
  await journal.milestones.upsertMilestone({ name: `milestone ${word}`, epochDay: DAY });
  await journal.procedures.upsertProcedure({ name: `procedure ${word}`, notes: 'plain notes' });
  await journal.checklists.addToStandaloneChecklist(`question ${word}`);
  await journal.checklists.setAppointmentDate(DAY);
  await journal.sideEffects.upsertSideEffect({ name: `effect ${word}`, severity: 2, epochDay: DAY });
  const tryoutId = await journal.tryouts.upsertTryout({
    kind: 'name',
    label: `tryout ${word}`,
    description: 'plain description',
    startEpochDay: DAY,
    endEpochDay: null
  });
  await journal.feltSense.add({ tryoutId }, { epochDay: DAY, mood: 4, note: `felt ${word}` });
  await journal.roadmap.addCustomGoal('legal', `goal ${word}`);
  await journal.affirmations.addLine('en', `affirmation ${word}`);
  await journal.labs.upsertResult({
    epochDay: DAY,
    analyte: 'Estradiol',
    value: 300,
    unit: 'pmol/L',
    note: `lab ${word}`
  });
  await journal.sizeRecords.upsertRecord({ epochDay: DAY, category: 'shirts', size: 'M', fitNote: `fit ${word}` });
  await journal.taper.upsertSession({ epochDay: DAY, note: `taper ${word}` });
  await journal.wearSessions.upsertSession({
    kind: 'binder',
    startTimestamp: startOfDayTimestamp(DAY) + 9 * 3_600_000,
    durationMs: 3_600_000,
    note: `wear ${word}`
  });
  await journal.voiceBenchmarks.saveBenchmark({
    epochDay: DAY,
    passageKey: 'rainbow',
    passageAudio: new Uint8Array([1, 2, 3]),
    vowelAudio: null,
    f0MedianHz: 180,
    f0P10Hz: 150,
    f0P90Hz: 210,
    semitoneSd: 2,
    wordsPerMinute: 120,
    f1Hz: null,
    f2Hz: null,
    snrDb: null,
    note: `benchmark ${word}`
  });
  await journal.hairProgress.upsertStage({ epochDay: DAY, scale: 'other', stage: '', description: `hair ${word}` });
  await journal.hairRemoval.upsertSession({
    epochDay: DAY,
    area: 'chin',
    method: 'laser',
    painRating: 2,
    provider: `provider ${word}`
  });
  await journal.regimen.upsertEpisode({
    drug: `drug ${word}`,
    ester: null,
    dose: 2,
    doseUnit: 'mg',
    route: 'oral',
    interval: 'daily',
    startEpochDay: DAY,
    endEpochDay: null,
    endReason: null
  });
  await journal.stock.upsertEntry({ drug: `stock ${word}`, quantity: 30, unit: 'tablets', recordedEpochDay: DAY });
  await journal.reminders.upsertReminder({
    title: `reminder ${word}`,
    type: 'other',
    time: '09:00',
    recurrence: null,
    interval: null,
    anchorEpochDay: null,
    epochDay: DAY,
    enabled: true
  });
  await journal.documents.addDocument(
    { epochDay: DAY, title: `document ${word}` },
    { full: new Uint8Array([1]), thumb: new Uint8Array([2]) }
  );
}
