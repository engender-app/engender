/* The flat descriptor itself (phase 5 ticket 13): that one declaration is
   enough to read an area's rows out, write them back and match the ones
   already there.

   Driven against a throwaway table no area owns, for the reason
   archiveSections.test.ts's own throwaway section gives - what is under test
   is the machinery, and a real area's rows would also be exercising that
   area's own decisions. Which sections are declared this way, and that they
   still travel, is the golden fixture's business
   (archive-golden.test.ts). */

import assert from 'node:assert/strict';
import { test } from 'vitest';
import type { ArchiveJournal } from '../archive/payload.ts';
import type { SqliteDriver } from '../sqlite/driver.ts';
import { migratedDb } from '../sqlite/test-support/migrated-db.ts';
import { readFlatTable, type SectionRead } from './archiveRead.ts';
import { applyFlatTable } from './archiveApply.ts';
import type { FlatTable } from './archiveTable.ts';

type MoonPhase = { id: string; epochDay: number; phase: string; waxing: boolean; note: string };

const MOON_PHASE: FlatTable<MoonPhase> = {
  table: 'moon_phase',
  identity: 'uuid',
  orderBy: 'epoch_day',
  columns: {
    uuid: 'id',
    epoch_day: 'epochDay',
    phase: 'phase',
    waxing: { field: 'waxing', bool: true },
    note: { field: 'note', whenNull: '', whenAbsent: '' }
  }
};

async function tableWithRows(rows: [string, number, string, number, string | null][]): Promise<SqliteDriver> {
  const driver = await migratedDb();
  await driver.run(
    `CREATE TABLE moon_phase (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       uuid TEXT NOT NULL UNIQUE,
       epoch_day INTEGER NOT NULL,
       phase TEXT NOT NULL,
       waxing INTEGER NOT NULL,
       note TEXT,
       updated_at INTEGER NOT NULL
     )`
  );
  for (const row of rows) {
    await driver.run('INSERT INTO moon_phase (uuid, epoch_day, phase, waxing, note, updated_at) VALUES (?, ?, ?, ?, ?, 1)', row);
  }
  return driver;
}

const reading = (driver: SqliteDriver): SectionRead =>
  ({ driver, photos: [], recordings: [], videos: [], hairPhotos: [], hairRemovalPhotos: [], procedurePhotos: [], tryoutPhotos: [] });

const restoring = (driver: SqliteDriver, rows: unknown[]) => ({
  driver,
  mode: 'replace' as const,
  journal: { moonPhases: rows } as unknown as ArchiveJournal,
  ts: 7
});

const landed = (driver: SqliteDriver) =>
  driver.query<{ uuid: string; epoch_day: number; phase: string; waxing: number; note: string | null; updated_at: number }>(
    'SELECT uuid, epoch_day, phase, waxing, note, updated_at FROM moon_phase ORDER BY epoch_day'
  );

test('the declared columns are what the read carries, in the order it declares them', async () => {
  const driver = await tableWithRows([
    ['m-2', 20007, 'full', 0, 'clear'],
    ['m-1', 20000, 'waxing', 1, null]
  ]);

  const rows = await readFlatTable(MOON_PHASE, reading(driver));

  assert.deepEqual(rows, [
    { id: 'm-1', epochDay: 20000, phase: 'waxing', waxing: true, note: '' },
    { id: 'm-2', epochDay: 20007, phase: 'full', waxing: false, note: 'clear' }
  ]);
  assert.deepEqual(Object.keys(rows[0]), ['id', 'epochDay', 'phase', 'waxing', 'note']);
});

test('the same declaration writes the rows back, stamped with the import clock', async () => {
  const driver = await tableWithRows([]);

  await applyFlatTable('moonPhases', MOON_PHASE, restoring(driver, [
    { id: 'm-1', epochDay: 20000, phase: 'waxing', waxing: true, note: 'thin' }
  ]));

  assert.deepEqual(
    (await landed(driver)).map((row) => [row.uuid, row.epoch_day, row.phase, row.waxing, row.note, row.updated_at]),
    [['m-1', 20000, 'waxing', 1, 'thin', 7]]
  );
});

test('a row the identity column already holds is left as it is rather than duplicated', async () => {
  const driver = await tableWithRows([['m-1', 20000, 'waxing', 1, 'as recorded here']]);

  await applyFlatTable('moonPhases', MOON_PHASE, restoring(driver, [
    { id: 'm-1', epochDay: 20000, phase: 'gibbous', waxing: false, note: 'as the archive has it' },
    { id: 'm-2', epochDay: 20007, phase: 'full', waxing: false, note: '' }
  ]));

  assert.deepEqual(
    (await landed(driver)).map((row) => [row.uuid, row.phase, row.note]),
    [
      ['m-1', 'waxing', 'as recorded here'],
      ['m-2', 'full', '']
    ]
  );
});

/* An archive written before a column existed does not carry its field at
   all, and binding undefined is a raw node:sqlite error rather than a soft
   failure - which is the whole reason a column can declare what it reads as
   when the field is simply not there. */
test('a field an older archive never carried is written from what the column declares', async () => {
  const driver = await tableWithRows([]);

  await applyFlatTable('moonPhases', MOON_PHASE, restoring(driver, [
    { id: 'm-1', epochDay: 20000, phase: 'waxing', waxing: true }
  ]));

  assert.deepEqual(
    (await landed(driver)).map((row) => row.note),
    ['']
  );
});
