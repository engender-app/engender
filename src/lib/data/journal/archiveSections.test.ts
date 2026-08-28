/* The registry itself: that the order it derives is the order the inserts
   actually need, and that one entry is the whole cost of making an area
   travel.

   What each section does with its own rows is not tested here - that is
   archive.test.ts and restore.test.ts, and the golden fixture
   (archive-golden.test.ts) is what proves none of them was dropped. */

import assert from 'node:assert/strict';
import { test } from 'vitest';
import { collect } from '../archive/container.ts';
import { openArchive, packArchive } from '../archive/pack.ts';
import { portablePreferences, type ArchiveJournal } from '../archive/payload.ts';
import { PREFERENCE_DEFAULTS } from '../prefs/catalogue.ts';
import { migratedDb } from '../sqlite/test-support/migrated-db.ts';
import { readRowContext } from './archiveRead.ts';
import {
  applyArchiveJournal,
  discardStatements,
  emptyArchiveJournal,
  orderedSections,
  readArchiveJournal,
  ARCHIVE_SECTIONS,
  ARCHIVE_SECTION_NAMES,
  type ArchiveSection
} from './archiveSections.ts';

const CHEAP_KDF = { memorySize: 256, iterations: 1, parallelism: 1, hashLength: 32 };

const stub = (name: string, after: readonly string[] = [], discard: readonly string[] = []): ArchiveSection => ({
  name,
  after,
  discard,
  read: async () => [],
  apply: async () => {}
});

const namesOf = (sections: readonly ArchiveSection[]) => sections.map((s) => s.name);

test('a section declared before the one it depends on is still applied after it', () => {
  const ordered = orderedSections([stub('feltSense', ['tryouts']), stub('tryouts')]);

  assert.deepEqual(namesOf(ordered), ['tryouts', 'feltSense']);
});

test('a section with no dependency keeps the position it was declared in', () => {
  const ordered = orderedSections([stub('letters'), stub('schedules', ['episodes']), stub('episodes'), stub('stock')]);

  assert.deepEqual(namesOf(ordered), ['letters', 'episodes', 'schedules', 'stock']);
});

test('a dependency nothing registers is refused rather than skipped', () => {
  assert.throws(() => orderedSections([stub('schedules', ['episodes'])]), /not registered/);
});

test('two sections that depend on each other are refused rather than guessed at', () => {
  assert.throws(() => orderedSections([stub('a', ['b']), stub('b', ['a'])]), /cycle/);
});

/* The real registry, not a stub set: the constraints it declares have to be
   the ones the apply functions need, and the two that carry child rows of
   their own must not have quietly grown a dependency the order does not
   state. */
test('the registry orders the vocabulary, the episodes and the tryouts before what resolves against them', () => {
  const order = namesOf(orderedSections());
  const at = (name: string) => order.indexOf(name);

  assert.ok(at('dimensions') < at('presets'));
  assert.ok(at('dimensions') < at('entries'));
  assert.ok(at('tagGroups') < at('entries'));
  assert.ok(at('regimenEpisodes') < at('doseSchedules'));
  assert.ok(at('regimenEpisodes') < at('dosePauses'));
  assert.ok(at('tryouts') < at('feltSenseEntries'));
});

test('every section the wire type declares is registered, once', () => {
  assert.equal(new Set(ARCHIVE_SECTION_NAMES).size, ARCHIVE_SECTION_NAMES.length);
  assert.deepEqual([...ARCHIVE_SECTION_NAMES].sort(), Object.keys(emptyArchiveJournal()).sort());
});

/* The constraints are not decoration. Felt-sense rows resolve their tryout's
   rowid against the rows applyTryouts just inserted, and a row whose tryout
   is not there yet is dropped rather than guessed at (archiveApply.ts) - so
   getting the order wrong loses data silently, which is exactly the failure
   `after` exists to make impossible. */
test('the tryouts constraint is what keeps felt-sense rows from being dropped', async () => {
  const journal: ArchiveJournal = {
    ...emptyArchiveJournal(),
    tryouts: [
      { id: 't-1', kind: 'name', label: 'Alex', description: null, startEpochDay: 19900, endEpochDay: null, photos: [] }
    ],
    feltSenseEntries: [{ id: 'f-1', tryoutId: 't-1', milestoneId: null, epochDay: 19910, mood: 4, note: null }]
  };
  const tryouts = ARCHIVE_SECTIONS.find((s) => s.name === 'tryouts')!;
  const milestones = ARCHIVE_SECTIONS.find((s) => s.name === 'milestones')!;
  const feltSense = ARCHIVE_SECTIONS.find((s) => s.name === 'feltSenseEntries')!;

  const survives = await applied([feltSense, tryouts, milestones], journal);
  const lost = await applied([{ ...feltSense, after: [] }, tryouts, milestones], journal);

  assert.equal(survives, 1, 'the declared constraint moved the felt-sense rows after their tryouts');
  assert.equal(lost, 0, 'without it they are applied first and dropped for want of a tryout');
});

/** How many felt-sense rows survive applying these sections, in this order. */
async function applied(sections: readonly ArchiveSection[], journal: ArchiveJournal): Promise<number> {
  const driver = await migratedDb();
  await driver.transaction(() => applyArchiveJournal({ driver, mode: 'replace', journal, ts: 1 }, sections));
  const rows = await driver.query<{ n: number }>('SELECT COUNT(*) AS n FROM felt_sense');
  return rows[0].n;
}

/* One entry, and an area travels. The throwaway below owns a table nothing
   else in the app knows about, and it is packed, encrypted, reopened and
   restored without a line changing in payload.ts, archive.ts or restore.ts -
   which is the whole claim the registry makes. */
test('a section added to the registry travels in a packed archive and comes back', async () => {
  const throwaway: ArchiveSection = {
    name: 'moonPhases',
    after: [],
    async read({ driver }) {
      return driver.query<{ epoch_day: number; phase: string }>(
        'SELECT epoch_day, phase FROM moon_phase ORDER BY epoch_day'
      );
    },
    discard: ['DELETE FROM moon_phase'],
    async apply({ driver, journal }) {
      const rows = (journal as unknown as Record<string, { epoch_day: number; phase: string }[]>).moonPhases;
      for (const row of rows) {
        await driver.run('INSERT INTO moon_phase (epoch_day, phase) VALUES (?, ?)', [row.epoch_day, row.phase]);
      }
    }
  };
  const sections = [...ARCHIVE_SECTIONS, throwaway];

  const source = await migratedDb();
  await source.run('CREATE TABLE moon_phase (epoch_day INTEGER NOT NULL, phase TEXT NOT NULL)');
  await source.run("INSERT INTO moon_phase (epoch_day, phase) VALUES (20000, 'waxing'), (20007, 'full')");

  const journal = await readArchiveJournal(await readRowContext(source), sections);

  const packed = await collect(
    packArchive(
      { journal, preferences: portablePreferences(PREFERENCE_DEFAULTS), files: [], readFile: async () => new Uint8Array() },
      'correct horse',
      CHEAP_KDF
    )
  );
  const opened = await openArchive(
    (async function* () {
      yield packed;
    })(),
    'correct horse'
  );

  const target = await migratedDb();
  await target.run('CREATE TABLE moon_phase (epoch_day INTEGER NOT NULL, phase TEXT NOT NULL)');
  await target.transaction(() =>
    applyArchiveJournal({ driver: target, mode: 'replace', journal: opened.payload.journal, ts: 1 }, sections)
  );

  const landed = await target.query<{ epoch_day: number; phase: string }>(
    'SELECT epoch_day, phase FROM moon_phase ORDER BY epoch_day'
  );
  assert.deepEqual(
    landed.map((row) => [row.epoch_day, row.phase]),
    [
      [20000, 'waxing'],
      [20007, 'full']
    ]
  );
});

/* Emptying the journal, derived rather than maintained. It used to be 51
   statements hand-ordered in restore.ts, children before parents, four of
   them conditional - a list that had to be re-read against the schema every
   time an area was added, and that the demo kept a second copy of, reaching
   seven of the thirty-six sections. */
test('a section clears before the one it inserts after, so the rows it points at are still there', () => {
  const statements = discardStatements([
    stub('episodes', [], ['DELETE FROM episode']),
    stub('schedules', ['episodes'], ['DELETE FROM schedule_weekday', 'DELETE FROM schedule'])
  ]);

  assert.deepEqual(statements, ['DELETE FROM schedule_weekday', 'DELETE FROM schedule', 'DELETE FROM episode']);
});

test('a section with no constraint clears in the reverse of the order it was declared in', () => {
  const statements = discardStatements([
    stub('letters', [], ['DELETE FROM letter']),
    stub('stock', [], ['DELETE FROM medication_stock'])
  ]);

  assert.deepEqual(statements, ['DELETE FROM medication_stock', 'DELETE FROM letter']);
});

/** Which table each statement empties, however it is qualified. */
const tableOf = (statement: string): string => {
  const named = /^DELETE FROM (\w+)/.exec(statement);
  assert.ok(named, `a discard statement that is not a DELETE of one table: ${statement}`);
  return named[1];
};

/* Tables emptying the journal deliberately leaves alone, each for a reason
   that is not "nobody got round to it". `effect_category` is built-in only -
   no custom-category creation is asked for - so it has no user rows to
   remove, the same as every other reference table's built-in half. `pref` is
   not the journal's at all (ADR-0003), which is what leaves the PIN, the
   app-lock flags and the disguise settings in place through the most
   destructive path in the app. `entry_fts` and its shadow tables are the
   search index: migration v3's trigger drops an index row with its entry.
   `sqlite_sequence` is SQLite's own AUTOINCREMENT bookkeeping. */
const EMPTIED_BY_NOTHING = [
  'effect_category',
  'pref',
  'entry_fts',
  'entry_fts_config',
  'entry_fts_data',
  'entry_fts_docsize',
  'entry_fts_idx',
  'sqlite_sequence'
];

/* The oracle for "a new area cannot be silently left behind": a table added
   to the schema and not named by any section's discard fails here, which is
   the failure the hand-ordered list could not produce. Written against
   sqlite_master rather than against the registry, so the two are independent
   - the same shape archive.test.ts's carried-column oracle has. */
test('every table in the schema is emptied by a section, or listed as one nothing empties', async () => {
  const driver = await migratedDb();
  const tables = await driver.query<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table'");

  const emptiedBy = new Map<string, { section: string; statement: string }[]>();
  for (const section of ARCHIVE_SECTIONS) {
    for (const statement of section.discard) {
      const table = tableOf(statement);
      emptiedBy.set(table, [...(emptiedBy.get(table) ?? []), { section: section.name, statement }]);
    }
  }

  for (const { name } of tables) {
    const owners = emptiedBy.get(name) ?? [];
    if (owners.length === 0) {
      assert.ok(
        EMPTIED_BY_NOTHING.includes(name),
        `${name} is emptied by no section and is not listed as one nothing empties`
      );
      continue;
    }
    /* One table can be shared, and `photo` is: entry-owned and
       milestone-owned rows in one table, with the schema's CHECK guaranteeing
       exactly one owner per row. What a shared table may not have is an
       unqualified statement, which would be one section emptying rows another
       section owns. */
    if (new Set(owners.map((o) => o.section)).size > 1) {
      for (const owner of owners) {
        assert.match(
          owner.statement,
          / WHERE /,
          `${name} is emptied by ${owners.map((o) => o.section).join(' and ')}, and ${owner.section} takes the whole table`
        );
      }
    }
  }

  const schema = new Set(tables.map((t) => t.name));
  for (const table of emptiedBy.keys()) {
    assert.ok(schema.has(table), `a discard statement names ${table}, which the schema does not have`);
  }
  for (const table of EMPTIED_BY_NOTHING) {
    assert.ok(schema.has(table), `${table} is listed as emptied by nothing but is not in the schema any more`);
  }
});

/* Not "every section has a statement": one legitimately has none, and a list
   of exceptions is the thing that rots. This asserts the shape of what is
   declared instead - a statement that is anything but a DELETE of one table
   would break both the oracle above and the reverse ordering below it. */
test('every section declares its discard as plain single-table deletes', () => {
  for (const section of ARCHIVE_SECTIONS) {
    for (const statement of section.discard) assert.ok(tableOf(statement));
  }
});
