/* The flat-area factory itself: that one field-to-column declaration is
   enough to read the rows out, insert, update and delete them.

   Driven against a throwaway table no area owns, for the reason
   archiveTable.test.ts's own throwaway table gives - what is under test is
   the machinery, and a real area's rows would also be exercising that
   area's decisions. Which areas are declared this way, and that they still
   round-trip, is each area's own tests.

   Two of these are facts no area's tests can see. `updated_at` is written
   by every area and read by nothing, so a factory that stopped writing it
   on update would fail nowhere (the insert would at least hit a NOT NULL).
   And a guard that runs after the write would still reject, so only a row
   count says it ran first. */

import assert from 'node:assert/strict';
import { test } from 'vitest';
import { migratedDb } from '../sqlite/test-support/migrated-db.ts';
import type { SqliteDriver } from '../sqlite/driver.ts';
import { flatArea, type FlatArea } from './flat-area.ts';

type MoonPhase = { id: string; epochDay: number; phase: string };

async function moonPhases(guard?: (input: Omit<MoonPhase, 'id'>) => void): Promise<{
  driver: SqliteDriver;
  phases: FlatArea<MoonPhase>;
}> {
  const driver = await migratedDb();
  await driver.run(
    `CREATE TABLE moon_phase (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       uuid TEXT NOT NULL UNIQUE,
       epoch_day INTEGER NOT NULL,
       phase TEXT NOT NULL,
       updated_at INTEGER NOT NULL
     )`
  );
  return {
    driver,
    phases: flatArea<MoonPhase>(driver, {
      table: 'moon_phase',
      columns: { epochDay: 'epoch_day', phase: 'phase' },
      guard
    })
  };
}

const stamps = (driver: SqliteDriver) =>
  driver.query<{ uuid: string; updated_at: number }>('SELECT uuid, updated_at FROM moon_phase');

test('a row inserts under a minted uuid, reads back as its domain object and updates by id', async () => {
  const { phases } = await moonPhases();
  await phases.upsert({ epochDay: 200, phase: 'waning' });
  const id = await phases.upsert({ epochDay: 100, phase: 'new' });

  assert.deepEqual(await phases.read('ORDER BY epoch_day'), [
    { id, epochDay: 100, phase: 'new' },
    { id: (await phases.read('WHERE epoch_day = 200'))[0].id, epochDay: 200, phase: 'waning' }
  ]);

  await phases.upsert({ id, epochDay: 100, phase: 'full' });

  assert.deepEqual(await phases.read('WHERE epoch_day = 100'), [{ id, epochDay: 100, phase: 'full' }]);
});

test('a read passes its own tail and params through', async () => {
  const { phases } = await moonPhases();
  await phases.upsert({ epochDay: 100, phase: 'new' });
  await phases.upsert({ epochDay: 150, phase: 'waxing' });
  await phases.upsert({ epochDay: 200, phase: 'full' });

  const inRange = await phases.read('WHERE epoch_day BETWEEN ? AND ? ORDER BY epoch_day DESC', [120, 250]);

  assert.deepEqual(inRange.map((phase) => phase.phase), ['full', 'waxing']);
});

test('updating an unknown id throws, naming the table as the area used to name it', async () => {
  const { phases } = await moonPhases();
  await assert.rejects(phases.upsert({ id: 'nope', epochDay: 100, phase: 'new' }), /unknown moon phase: nope/);
});

test('deleting an unknown id succeeds and changes nothing', async () => {
  const { phases } = await moonPhases();
  const id = await phases.upsert({ epochDay: 100, phase: 'new' });

  await phases.delete(id);
  await phases.delete(id);
  await phases.delete('never-existed');

  assert.deepEqual(await phases.read(''), []);
});

test('both writes stamp updated_at, which no area reads and so no area can catch', async () => {
  const { driver, phases } = await moonPhases();
  const id = await phases.upsert({ epochDay: 100, phase: 'new' });
  const [inserted] = await stamps(driver);
  assert.ok(inserted.updated_at > 0);

  await driver.run('UPDATE moon_phase SET updated_at = 1 WHERE uuid = ?', [id]);
  await phases.upsert({ id, epochDay: 100, phase: 'full' });

  const [updated] = await stamps(driver);
  assert.ok(updated.updated_at > 1, `expected a fresh stamp, got ${updated.updated_at}`);
});

test('the guard refuses an input before anything is written', async () => {
  const { phases } = await moonPhases((input) => {
    if (input.phase === 'gibbous') throw new Error('too specific');
  });

  await assert.rejects(phases.upsert({ epochDay: 100, phase: 'gibbous' }), /too specific/);

  assert.deepEqual(await phases.read(''), []);
});
