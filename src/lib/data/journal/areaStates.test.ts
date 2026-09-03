/* The area record (phase 8 deepening ticket 13, ADR-0052): what a row says,
   and what an absent row says. */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { journalWithBuiltIns } from './test-support.ts';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { areaHidden, areaQuiet } from '../areaState.ts';

const rowCount = async (db: { query: (sql: string) => Promise<{ n: number }[]> }): Promise<number> =>
  (await db.query('SELECT COUNT(*) AS n FROM area_state'))[0].n;

test('a journal nobody has said anything about holds no rows and reads as resting', async () => {
  const { journal, db } = await journalWithBuiltIns();

  assert.deepEqual(await journal.areaStates.getAreaStates(), {});
  assert.equal(await rowCount(db), 0);
});

test('hiding an area reads back, and hiding it does not finish it', async () => {
  const { journal } = await journalWithBuiltIns();

  await journal.areaStates.setAreasHidden(['measurements'], true);

  const states = await journal.areaStates.getAreaStates();
  assert.deepEqual(states.measurements, { hidden: true, finishedEpochDay: null });
  assert.equal(areaHidden('measurements', states), true);
});

test('one hub row fronting two sections finishes both, in one call', async () => {
  const { journal, db } = await journalWithBuiltIns();

  await journal.areaStates.setAreasFinished(['hairStages', 'hairPhotos'], 19900);

  const states = await journal.areaStates.getAreaStates();
  assert.deepEqual(states.hairStages, { hidden: false, finishedEpochDay: 19900 });
  assert.deepEqual(states.hairPhotos, { hidden: false, finishedEpochDay: 19900 });
  assert.equal(await rowCount(db), 2);
});

test('a finished area is not hidden by finishing, and stays readable and searchable', async () => {
  const { journal } = await journalWithBuiltIns();
  await journal.sideEffects.upsertSideEffect({ name: 'dry skin', severity: 2, epochDay: 19800 });

  await journal.areaStates.setAreasFinished(['sideEffects'], 19850);

  const states = await journal.areaStates.getAreaStates();
  assert.equal(areaHidden('sideEffects', states), false);
  assert.equal(areaQuiet('sideEffects', states, 19900), true);

  // Nothing was deleted and nothing was hidden from search: finishing an
  // area is a statement about adding to it, not about reading it.
  const effects = await journal.sideEffects.getSideEffects();
  assert.equal(effects.length, 1);
  const hits = await journal.textSearch.search({ query: 'dry skin', today: 19900, limit: 10 });
  assert.ok(hits.hits.some((hit) => hit.area === 'sideEffects'), 'a finished area is still searched');
});

test('the two flags are independent in both directions, and un-finishing leaves hiding alone', async () => {
  const { journal } = await journalWithBuiltIns();

  await journal.areaStates.setAreasHidden(['wearSessions'], true);
  await journal.areaStates.setAreasFinished(['wearSessions'], 19700);
  assert.deepEqual((await journal.areaStates.getAreaStates()).wearSessions, {
    hidden: true,
    finishedEpochDay: 19700
  });

  await journal.areaStates.setAreasFinished(['wearSessions'], null);
  assert.deepEqual((await journal.areaStates.getAreaStates()).wearSessions, {
    hidden: true,
    finishedEpochDay: null
  });

  await journal.areaStates.setAreasHidden(['wearSessions'], true);
  await journal.areaStates.setAreasFinished(['wearSessions'], 19700);
  await journal.areaStates.setAreasHidden(['wearSessions'], false);
  assert.deepEqual((await journal.areaStates.getAreaStates()).wearSessions, {
    hidden: false,
    finishedEpochDay: 19700
  });
});

test('an area that goes back to saying nothing keeps no row saying so', async () => {
  const { journal, db } = await journalWithBuiltIns();

  await journal.areaStates.setAreasHidden(['sizeRecords'], true);
  await journal.areaStates.setAreasFinished(['sizeRecords'], 19500);
  assert.equal(await rowCount(db), 1);

  await journal.areaStates.setAreasHidden(['sizeRecords'], false);
  await journal.areaStates.setAreasFinished(['sizeRecords'], null);

  assert.deepEqual(await journal.areaStates.getAreaStates(), {});
  assert.equal(await rowCount(db), 0);
});

test('un-finishing an area nobody ever finished writes nothing', async () => {
  const { journal, db } = await journalWithBuiltIns();

  await journal.areaStates.setAreasFinished(['voiceBenchmarks'], null);
  await journal.areaStates.setAreasHidden(['personalEffects'], false);

  assert.equal(await rowCount(db), 0);
});

test('setting no areas at all writes nothing', async () => {
  const { journal, db } = await journalWithBuiltIns();

  await journal.areaStates.setAreasFinished([], 19900);
  await journal.areaStates.setAreasHidden([], true);

  assert.equal(await rowCount(db), 0);
});

/* A negative, so it needs the same shape delete-contract.test.ts uses: a
   grep, plus a second read over something that does match, so a scan that
   stopped finding files fails loudly rather than passing vacuously.

   The rule it holds: a screen asks the journal handle and the gate in
   `areaState.ts`, never the table. Every registry in the data tier that
   knows about this area - the invalidation map, the archive, the day view,
   search - hangs off that seam, and a route reaching past it into SQL gets
   none of them. */
test('no screen reads the table itself', () => {
  const routes = fileURLToPath(new URL('../../../routes', import.meta.url));

  const sources = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const path = `${dir}/${entry.name}`;
      return entry.isDirectory() ? sources(path) : [path];
    });

  const files = sources(routes);
  assert.ok(files.length > 60, `the scan found ${files.length} route files, so it is not reading the tree`);

  const reaching = files.filter((file) => readFileSync(file, 'utf8').includes('area_state'));
  assert.deepEqual(reaching, [], 'a route naming the table instead of asking the journal');

  // The reader works: the table every screen does reach through is named in
  // plenty of them, so an empty answer above means what it says.
  const asking = files.filter((file) => readFileSync(file, 'utf8').includes('journal.'));
  assert.ok(asking.length > 0, 'the reader found no screen calling the journal at all');
});
