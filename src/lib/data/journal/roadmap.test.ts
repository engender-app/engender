/* The roadmap area (phase 4 ticket 23, widened phase 5 ticket 20 for a
   tri-state tick and custom goals; CONTEXT: "Roadmap goal", "Country
   pack", "Custom"). The area stores ticks, custom goals and nothing else;
   what the bundled goals are is roadmap.ts's business, and the tests here
   never import a pack so that the seam stays honest - a stub pack key is
   as valid here as 'pl'. */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { journalWithBuiltIns, UUID_PATTERN } from './test-support.ts';

test('a bundled goal with no status at all is absent from getGoalStatuses', async () => {
  const { journal } = await journalWithBuiltIns();

  assert.deepEqual(await journal.roadmap.getGoalStatuses('pl'), {});
});

test('checking a goal reads back, and clearing it to unchecked leaves nothing behind', async () => {
  const { journal, db } = await journalWithBuiltIns();

  await journal.roadmap.setGoalStatus('pl', 'pl-legal-court-file', 'checked');
  assert.deepEqual(await journal.roadmap.getGoalStatuses('pl'), { 'pl-legal-court-file': 'checked' });

  await journal.roadmap.setGoalStatus('pl', 'pl-legal-court-file', 'unchecked');
  assert.deepEqual(await journal.roadmap.getGoalStatuses('pl'), {});

  const rows = await db.query<{ n: number }>('SELECT COUNT(*) AS n FROM roadmap_check');
  assert.equal(rows[0].n, 0, 'an unchecked goal keeps no row at all');
});

test('marking a goal not-my-path is a third state, distinct from unchecked and checked', async () => {
  const { journal } = await journalWithBuiltIns();

  await journal.roadmap.setGoalStatus('pl', 'pl-legal-appeal', 'not-my-path');
  assert.deepEqual(await journal.roadmap.getGoalStatuses('pl'), { 'pl-legal-appeal': 'not-my-path' });
});

test('setting a status is idempotent, and re-setting the same status keeps one row', async () => {
  const { journal, db } = await journalWithBuiltIns();

  await journal.roadmap.setGoalStatus('pl', 'pl-social-tell-someone', 'checked');
  await journal.roadmap.setGoalStatus('pl', 'pl-social-tell-someone', 'checked');
  await journal.roadmap.setGoalStatus('pl', 'pl-social-tell-someone', 'not-my-path');
  await journal.roadmap.setGoalStatus('pl', 'pl-social-tell-someone', 'unchecked');
  await journal.roadmap.setGoalStatus('pl', 'pl-social-tell-someone', 'unchecked');

  const rows = await db.query<{ n: number }>('SELECT COUNT(*) AS n FROM roadmap_check');
  assert.equal(rows[0].n, 0);
});

test('goals in each of the four tracks are ticked independently of one another', async () => {
  const { journal } = await journalWithBuiltIns();

  for (const key of ['pl-social-a', 'pl-legal-b', 'pl-presentational-c', 'pl-medical-d']) {
    await journal.roadmap.setGoalStatus('pl', key, 'checked');
  }
  await journal.roadmap.setGoalStatus('pl', 'pl-legal-b', 'unchecked');

  assert.deepEqual(await journal.roadmap.getGoalStatuses('pl'), {
    'pl-social-a': 'checked',
    'pl-presentational-c': 'checked',
    'pl-medical-d': 'checked'
  });
});

/* Acceptance box 3 (phase 4 ticket 23): a second country's pack has to be
   content alone. The stub key here has no bundled pack behind it and no
   migration was run for it, which is the whole assertion. */
test('a second pack keeps its own statuses, with no schema change behind it', async () => {
  const { journal } = await journalWithBuiltIns();

  await journal.roadmap.setGoalStatus('pl', 'shared-goal-key', 'checked');
  await journal.roadmap.setGoalStatus('stub-second-country', 'shared-goal-key', 'checked');
  await journal.roadmap.setGoalStatus('stub-second-country', 'stub-only-goal', 'not-my-path');

  assert.deepEqual(await journal.roadmap.getGoalStatuses('pl'), { 'shared-goal-key': 'checked' });
  assert.deepEqual(await journal.roadmap.getGoalStatuses('stub-second-country'), {
    'shared-goal-key': 'checked',
    'stub-only-goal': 'not-my-path'
  });

  await journal.roadmap.setGoalStatus('stub-second-country', 'shared-goal-key', 'unchecked');
  assert.deepEqual(await journal.roadmap.getGoalStatuses('pl'), { 'shared-goal-key': 'checked' }, 'the other pack is untouched');
});

test('a tick writes no entry row - a roadmap goal is not a logged moment', async () => {
  const { journal, db } = await journalWithBuiltIns();
  await journal.roadmap.setGoalStatus('pl', 'pl-medical-first-appointment', 'checked');

  const entries = await db.query<{ n: number }>('SELECT COUNT(*) AS n FROM entry');
  assert.equal(entries[0].n, 0);
});

test('a custom goal gets a minted uuid id, starts unchecked, and is never translated', async () => {
  const { journal } = await journalWithBuiltIns();

  const goal = await journal.roadmap.addCustomGoal('social', 'Tell my sister');
  assert.match(goal.id, UUID_PATTERN);
  assert.deepEqual(goal, { id: goal.id, track: 'social', text: 'Tell my sister', status: 'unchecked' });
});

test('custom goals come back in the order they were added, appended per track', async () => {
  const { journal } = await journalWithBuiltIns();

  const first = await journal.roadmap.addCustomGoal('legal', 'Ask the court about remote hearings');
  const second = await journal.roadmap.addCustomGoal('social', 'Come out to my book club');
  const third = await journal.roadmap.addCustomGoal('legal', 'Find a trans-friendly notary');

  assert.deepEqual(
    (await journal.roadmap.getCustomGoals()).map((g) => g.id),
    [first.id, second.id, third.id]
  );
});

test('a custom goal ticks through the same tri-state a bundled one does', async () => {
  const { journal } = await journalWithBuiltIns();
  const goal = await journal.roadmap.addCustomGoal('presentational', 'A haircut I feel like myself in');

  await journal.roadmap.setCustomGoalStatus(goal.id, 'checked');
  assert.equal((await journal.roadmap.getCustomGoals())[0].status, 'checked');

  await journal.roadmap.setCustomGoalStatus(goal.id, 'not-my-path');
  assert.equal((await journal.roadmap.getCustomGoals())[0].status, 'not-my-path');

  await journal.roadmap.setCustomGoalStatus(goal.id, 'unchecked');
  assert.equal((await journal.roadmap.getCustomGoals())[0].status, 'unchecked');
});

test('setting a custom goal that does not exist fails loudly rather than doing nothing', async () => {
  const { journal } = await journalWithBuiltIns();
  await assert.rejects(() => journal.roadmap.setCustomGoalStatus('not-a-real-uuid', 'checked'));
});

/* Editing and deleting a custom goal (phase 8 features ticket 69,
   ADR-0068). A built-in goal has neither and never will: there is no row
   to edit and nothing to delete, so everything below is about the kind
   somebody typed themselves. */

test('a custom goal can be reworded, and keeps its id, its track and its tick', async () => {
  const { journal } = await journalWithBuiltIns();
  const goal = await journal.roadmap.addCustomGoal('social', 'Tell my sster');
  await journal.roadmap.setCustomGoalStatus(goal.id, 'checked');

  await journal.roadmap.updateCustomGoalText(goal.id, 'Tell my sister');

  assert.deepEqual(await journal.roadmap.getCustomGoals(), [
    { id: goal.id, track: 'social', text: 'Tell my sister', status: 'checked' }
  ]);
});

test('rewording a custom goal that does not exist fails loudly rather than doing nothing', async () => {
  const { journal } = await journalWithBuiltIns();
  await assert.rejects(() => journal.roadmap.updateCustomGoalText('not-a-real-uuid', 'Anything at all'));
});

test('deleting a custom goal removes it and leaves the rest in the order they were added', async () => {
  const { journal } = await journalWithBuiltIns();
  const first = await journal.roadmap.addCustomGoal('legal', 'Ask the court about remote hearings');
  const second = await journal.roadmap.addCustomGoal('legal', 'Find a trans-friendly notary');
  const third = await journal.roadmap.addCustomGoal('social', 'Come out to my book club');

  await journal.roadmap.deleteCustomGoal(second.id);

  assert.deepEqual(
    (await journal.roadmap.getCustomGoals()).map((g) => g.id),
    [first.id, third.id]
  );
});

test('deleting a custom goal is idempotent, and an id that was never there is success (ADR-0053)', async () => {
  const { journal } = await journalWithBuiltIns();
  const goal = await journal.roadmap.addCustomGoal('medical', 'Ask about a second opinion');

  await journal.roadmap.deleteCustomGoal(goal.id);
  await journal.roadmap.deleteCustomGoal(goal.id);
  await journal.roadmap.deleteCustomGoal('not-a-real-uuid');

  assert.deepEqual(await journal.roadmap.getCustomGoals(), []);
});

test('deleting a custom goal leaves the milestone it minted, link and all', async () => {
  /* ADR-0068 keeps the link rather than nulling it: provenance.ts already
     renders a fallback for a goal key that fails to resolve, and this is
     simply a second way to reach it. What goes is the joined text, which
     is what makes that line fall back. */
  const { journal } = await journalWithBuiltIns();
  const goal = await journal.roadmap.addCustomGoal('presentational', 'A haircut I feel like myself in');
  const milestoneId = await journal.milestones.upsertMilestone({
    name: 'A haircut I feel like myself in',
    epochDay: 20500,
    roadmapGoalKey: goal.id
  });

  await journal.roadmap.deleteCustomGoal(goal.id);

  const found = (await journal.milestones.getMilestones()).find((one) => one.id === milestoneId);
  assert.equal(found?.name, 'A haircut I feel like myself in');
  assert.equal(found?.roadmapGoalKey, goal.id);
  assert.equal(found?.customRoadmapGoalText, null);
});

test("rewording a custom goal reaches a minted milestone's provenance, never its own name", async () => {
  /* Two texts, and only one of them moves. The milestone's name was copied
     in at mint time and is what the person confirmed that day; the
     provenance line re-resolves through the join every read. */
  const { journal } = await journalWithBuiltIns();
  const goal = await journal.roadmap.addCustomGoal('legal', 'Fille the court application');
  const milestoneId = await journal.milestones.upsertMilestone({
    name: 'Fille the court application',
    epochDay: 20500,
    roadmapGoalKey: goal.id
  });

  await journal.roadmap.updateCustomGoalText(goal.id, 'File the court application');

  const found = (await journal.milestones.getMilestones()).find((one) => one.id === milestoneId);
  assert.equal(found?.name, 'Fille the court application');
  assert.equal(found?.customRoadmapGoalText, 'File the court application');
});

/* "Not my path" one grain out (phase 8 features ticket 49 item 5). Presence
   is the whole state here, unlike a goal's tri-state: a track is either
   somebody's path or it is not, and there is no track-level equivalent of
   "checked". */

test('no track is dismissed to begin with', async () => {
  const { journal } = await journalWithBuiltIns();
  assert.deepEqual(await journal.roadmap.getDismissedTracks(), []);
});

test('a dismissed track comes back, and undoing it deletes the row rather than storing a value', async () => {
  const { journal } = await journalWithBuiltIns();

  await journal.roadmap.setTrackDismissed('medical', true);
  assert.deepEqual(await journal.roadmap.getDismissedTracks(), ['medical']);

  await journal.roadmap.setTrackDismissed('medical', false);
  assert.deepEqual(await journal.roadmap.getDismissedTracks(), []);
});

test('dismissing a track twice is idempotent, and undoing one never dismissed is not an error', async () => {
  const { journal } = await journalWithBuiltIns();

  await journal.roadmap.setTrackDismissed('legal', true);
  await journal.roadmap.setTrackDismissed('legal', true);
  assert.deepEqual(await journal.roadmap.getDismissedTracks(), ['legal']);

  await journal.roadmap.setTrackDismissed('social', false);
  assert.deepEqual(await journal.roadmap.getDismissedTracks(), ['legal']);
});

test('tracks are dismissed one at a time and come back in a stable order', async () => {
  const { journal } = await journalWithBuiltIns();

  await journal.roadmap.setTrackDismissed('presentational', true);
  await journal.roadmap.setTrackDismissed('legal', true);

  assert.deepEqual(await journal.roadmap.getDismissedTracks(), ['legal', 'presentational']);
});

test('dismissing a track leaves every goal status it holds exactly as it was', async () => {
  /* The fold is a reading of the stored ticks, never a write over them:
     somebody who dismisses the medical track and changes their mind gets
     back what they had ticked, not an emptied list. */
  const { journal } = await journalWithBuiltIns();
  await journal.roadmap.setGoalStatus('pl', 'pl-medical-bloodwork', 'checked');
  const goal = await journal.roadmap.addCustomGoal('medical', 'Ask about a second opinion');
  await journal.roadmap.setCustomGoalStatus(goal.id, 'checked');

  await journal.roadmap.setTrackDismissed('medical', true);

  assert.deepEqual(await journal.roadmap.getGoalStatuses('pl'), { 'pl-medical-bloodwork': 'checked' });
  assert.equal((await journal.roadmap.getCustomGoals())[0].status, 'checked');
});

test('minting a milestone with a roadmapGoalKey links the goal key (ticket 10, ADR-0045)', async () => {
  const { journal } = await journalWithBuiltIns();
  await journal.roadmap.setGoalStatus('pl', 'pl-legal-id-card', 'checked');

  const milestoneId = await journal.milestones.upsertMilestone({
    name: 'New ID card received',
    epochDay: 20500,
    roadmapGoalKey: 'pl-legal-id-card'
  });

  const milestones = await journal.milestones.getMilestones();
  const found = milestones.find((m) => m.id === milestoneId);
  assert.ok(found);
  assert.equal(found.roadmapGoalKey, 'pl-legal-id-card');
});

test('deleting a linked milestone leaves the roadmap goal checked (graceful unlink, ticket 10)', async () => {
  const { journal } = await journalWithBuiltIns();
  await journal.roadmap.setGoalStatus('pl', 'pl-legal-name-usc', 'checked');

  const milestoneId = await journal.milestones.upsertMilestone({
    name: 'Name changed at USC',
    epochDay: 20400,
    roadmapGoalKey: 'pl-legal-name-usc'
  });

  await journal.milestones.deleteMilestone(milestoneId);

  const milestones = await journal.milestones.getMilestones();
  assert.equal(milestones.some((m) => m.id === milestoneId), false);

  const statuses = await journal.roadmap.getGoalStatuses('pl');
  assert.equal(statuses['pl-legal-name-usc'], 'checked');
});
