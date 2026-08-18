/* The roadmap area (phase 4 ticket 23, CONTEXT: "Roadmap goal", "Country
   pack"). The area stores ticks and nothing else; what the goals are is
   roadmap.ts's business, and the tests here never import a pack so that
   the seam stays honest - a stub pack key is as valid here as 'pl'. */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { journalWithBuiltIns } from './test-support.ts';

test('ticking a goal reads back, and unticking it leaves nothing behind', async () => {
  const { journal, db } = await journalWithBuiltIns();

  await journal.roadmap.setGoalChecked('pl', 'pl-legal-court-file', true);
  assert.deepEqual(await journal.roadmap.getCheckedGoals('pl'), ['pl-legal-court-file']);

  await journal.roadmap.setGoalChecked('pl', 'pl-legal-court-file', false);
  assert.deepEqual(await journal.roadmap.getCheckedGoals('pl'), []);

  const rows = await db.query<{ n: number }>('SELECT COUNT(*) AS n FROM roadmap_check');
  assert.equal(rows[0].n, 0, 'an unticked goal keeps no row at all');
});

test('ticking is idempotent both ways, so a double tap cannot duplicate a row', async () => {
  const { journal, db } = await journalWithBuiltIns();

  await journal.roadmap.setGoalChecked('pl', 'pl-social-tell-someone', true);
  await journal.roadmap.setGoalChecked('pl', 'pl-social-tell-someone', true);
  await journal.roadmap.setGoalChecked('pl', 'pl-social-tell-someone', false);
  await journal.roadmap.setGoalChecked('pl', 'pl-social-tell-someone', false);

  const rows = await db.query<{ n: number }>('SELECT COUNT(*) AS n FROM roadmap_check');
  assert.equal(rows[0].n, 0);
});

test('goals in each of the four tracks tick independently of one another', async () => {
  const { journal } = await journalWithBuiltIns();

  for (const key of ['pl-social-a', 'pl-legal-b', 'pl-presentational-c', 'pl-medical-d']) {
    await journal.roadmap.setGoalChecked('pl', key, true);
  }
  await journal.roadmap.setGoalChecked('pl', 'pl-legal-b', false);

  assert.deepEqual(await journal.roadmap.getCheckedGoals('pl'), [
    'pl-medical-d',
    'pl-presentational-c',
    'pl-social-a'
  ]);
});

/* Acceptance box 3: a second country's pack has to be content alone. The
   stub key here has no bundled pack behind it and no migration was run
   for it, which is the whole assertion. */
test('a second pack keeps its own ticks, with no schema change behind it', async () => {
  const { journal } = await journalWithBuiltIns();

  await journal.roadmap.setGoalChecked('pl', 'shared-goal-key', true);
  await journal.roadmap.setGoalChecked('stub-second-country', 'shared-goal-key', true);
  await journal.roadmap.setGoalChecked('stub-second-country', 'stub-only-goal', true);

  assert.deepEqual(await journal.roadmap.getCheckedGoals('pl'), ['shared-goal-key']);
  assert.deepEqual(await journal.roadmap.getCheckedGoals('stub-second-country'), [
    'shared-goal-key',
    'stub-only-goal'
  ]);

  await journal.roadmap.setGoalChecked('stub-second-country', 'shared-goal-key', false);
  assert.deepEqual(await journal.roadmap.getCheckedGoals('pl'), ['shared-goal-key'], 'the other pack is untouched');
});

test('a tick writes no entry row - a roadmap goal is not a logged moment', async () => {
  const { journal, db } = await journalWithBuiltIns();
  await journal.roadmap.setGoalChecked('pl', 'pl-medical-first-appointment', true);

  const entries = await db.query<{ n: number }>('SELECT COUNT(*) AS n FROM entry');
  assert.equal(entries[0].n, 0);
});
