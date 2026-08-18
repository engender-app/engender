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
  emptyArchiveJournal,
  orderedSections,
  ARCHIVE_SECTIONS,
  ARCHIVE_SECTION_NAMES,
  type ArchiveSection
} from './archiveSections.ts';

const CHEAP_KDF = { memorySize: 256, iterations: 1, parallelism: 1, hashLength: 32 };

const stub = (name: string, after: readonly string[] = []): ArchiveSection => ({
  name,
  after,
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

  const journal: ArchiveJournal = { ...emptyArchiveJournal() };
  for (const s of sections) {
    (journal as unknown as Record<string, unknown[]>)[s.name] = await s.read(await readRowContext(source));
  }

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
