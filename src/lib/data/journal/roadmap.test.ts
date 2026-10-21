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

  await journal.roadmap.setGoalStatus('pl', 'pl-legal-which-court', 'checked');
  await journal.roadmap.setGoalStatus('pl', 'pl-legal-which-court', 'checked');
  await journal.roadmap.setGoalStatus('pl', 'pl-legal-which-court', 'not-my-path');
  await journal.roadmap.setGoalStatus('pl', 'pl-legal-which-court', 'unchecked');
  await journal.roadmap.setGoalStatus('pl', 'pl-legal-which-court', 'unchecked');

  const rows = await db.query<{ n: number }>('SELECT COUNT(*) AS n FROM roadmap_check');
  assert.equal(rows[0].n, 0);
});

test('goals are ticked independently of one another, whatever their key', async () => {
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

  const goal = await journal.roadmap.addCustomGoal('Tell my sister');
  assert.match(goal.id, UUID_PATTERN);
  // Written as 'legal', the one track left since functional audit ticket 34.
  assert.deepEqual(goal, { id: goal.id, track: 'legal', text: 'Tell my sister', status: 'unchecked' });
});

test('custom goals come back in the order they were added', async () => {
  const { journal } = await journalWithBuiltIns();

  const first = await journal.roadmap.addCustomGoal('Ask the court about remote hearings');
  const second = await journal.roadmap.addCustomGoal('Come out to my book club');
  const third = await journal.roadmap.addCustomGoal('Find a trans-friendly notary');

  assert.deepEqual(
    (await journal.roadmap.getCustomGoals()).map((g) => g.id),
    [first.id, second.id, third.id]
  );
});

test('a custom goal ticks through the same tri-state a bundled one does', async () => {
  const { journal } = await journalWithBuiltIns();
  const goal = await journal.roadmap.addCustomGoal('A haircut I feel like myself in');

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
  const goal = await journal.roadmap.addCustomGoal('Tell my sster');
  await journal.roadmap.setCustomGoalStatus(goal.id, 'checked');

  await journal.roadmap.updateCustomGoalText(goal.id, 'Tell my sister');

  assert.deepEqual(await journal.roadmap.getCustomGoals(), [
    { id: goal.id, track: 'legal', text: 'Tell my sister', status: 'checked' }
  ]);
});

test('rewording a custom goal that does not exist fails loudly rather than doing nothing', async () => {
  const { journal } = await journalWithBuiltIns();
  await assert.rejects(() => journal.roadmap.updateCustomGoalText('not-a-real-uuid', 'Anything at all'));
});

test('deleting a custom goal removes it and leaves the rest in the order they were added', async () => {
  const { journal } = await journalWithBuiltIns();
  const first = await journal.roadmap.addCustomGoal('Ask the court about remote hearings');
  const second = await journal.roadmap.addCustomGoal('Find a trans-friendly notary');
  const third = await journal.roadmap.addCustomGoal('Come out to my book club');

  await journal.roadmap.deleteCustomGoal(second.id);

  assert.deepEqual(
    (await journal.roadmap.getCustomGoals()).map((g) => g.id),
    [first.id, third.id]
  );
});

test('deleting a custom goal is idempotent, and an id that was never there is success (ADR-0053)', async () => {
  const { journal } = await journalWithBuiltIns();
  const goal = await journal.roadmap.addCustomGoal('Ask about a second opinion');

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
  const goal = await journal.roadmap.addCustomGoal('A haircut I feel like myself in');
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
  const goal = await journal.roadmap.addCustomGoal('Fille the court application');
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

test('deleting a custom goal unfiles the paper filed against it and keeps the paper', async () => {
  /* Ticket 56's link is a (kind, id) pair with no foreign key behind it
     (documents.ts), so nothing cascades and this delete has to clear it
     itself - the same UPDATE-before-DELETE deleteMilestone and
     deleteProcedure run. What must not happen is the document going with
     the goal: the paper is the person's, the filing was a note about where
     it belonged. */
  const { journal } = await journalWithBuiltIns();
  const goal = await journal.roadmap.addCustomGoal('Get the referral reissued');
  const other = await journal.roadmap.addCustomGoal('Book the follow-up');
  const page = () => ({ full: new Uint8Array([1]), thumb: new Uint8Array([2]) });
  const filed = await journal.documents.addDocument({ epochDay: 20400, title: 'Referral' }, page());
  const elsewhere = await journal.documents.addDocument({ epochDay: 20400, title: 'Second opinion' }, page());
  await journal.documents.setDocumentTarget(filed, { kind: 'goal', id: goal.id });
  await journal.documents.setDocumentTarget(elsewhere, { kind: 'goal', id: other.id });

  await journal.roadmap.deleteCustomGoal(goal.id);

  const unfiled = (await journal.documents.getDocument(filed))!;
  assert.equal(unfiled.title, 'Referral');
  assert.equal(unfiled.targetKind, null);
  assert.equal(unfiled.targetId, null);

  const untouched = (await journal.documents.getDocument(elsewhere))!;
  assert.equal(untouched.targetKind, 'goal');
  assert.equal(untouched.targetId, other.id);
});

test('deleting a custom goal leaves a built-in goal that happens to share the delete alone', async () => {
  /* A goal link's id is a pack-and-key string for a built-in goal and a
     uuid for a custom one (types.ts, the duality `Milestone.roadmapGoalKey`
     already carries), so the two live in one column and the clearing
     UPDATE has to match on the id it was handed rather than on the kind. */
  const { journal } = await journalWithBuiltIns();
  const goal = await journal.roadmap.addCustomGoal('Get the referral reissued');
  const page = () => ({ full: new Uint8Array([1]), thumb: new Uint8Array([2]) });
  const builtin = await journal.documents.addDocument({ epochDay: 20400, title: 'Opinion' }, page());
  await journal.documents.setDocumentTarget(builtin, { kind: 'goal', id: 'pl-legal-final-copy' });

  await journal.roadmap.deleteCustomGoal(goal.id);

  const kept = (await journal.documents.getDocument(builtin))!;
  assert.equal(kept.targetKind, 'goal');
  assert.equal(kept.targetId, 'pl-legal-final-copy');
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


test('hiding one bundled goal preserves statuses, links and other goals', async () => {
  const { journal, db } = await journalWithBuiltIns();
  const key = 'pl-legal-id-card';
  await journal.roadmap.setGoalStatus('pl', key, 'checked');
  await journal.roadmap.setGoalStatus('pl', 'pl-legal-appeal', 'not-my-path');
  const milestone = await journal.milestones.upsertMilestone({ name: 'ID card', epochDay: 20500, roadmapGoalKey: key });
  const document = await journal.documents.addDocument({ epochDay: 20500, title: 'Receipt' }, {
    full: new Uint8Array([1]), thumb: new Uint8Array([2])
  });
  await journal.documents.setDocumentTarget(document, { kind: 'goal', id: key });

  await journal.roadmap.setGoalHidden('pl', key, true);
  await journal.roadmap.setGoalHidden('pl', key, true);
  assert.deepEqual(await journal.roadmap.getHiddenGoals('pl'), [key]);
  assert.deepEqual(await journal.roadmap.getHiddenGoals('another-pack'), []);
  assert.deepEqual(await journal.roadmap.getGoalStatuses('pl'), { [key]: 'checked', 'pl-legal-appeal': 'not-my-path' });
  assert.equal((await journal.documents.getDocument(document))?.targetId, key);
  assert.equal((await journal.milestones.getMilestones()).find((one) => one.id === milestone)?.roadmapGoalKey, key);

  await journal.roadmap.setGoalHidden('pl', key, false);
  assert.deepEqual(await journal.roadmap.getHiddenGoals('pl'), []);
  assert.equal((await journal.roadmap.getGoalStatuses('pl'))[key], 'checked');
  assert.equal((await db.query<{ n: number }>('SELECT COUNT(*) AS n FROM document'))[0].n, 1);
});

test('hidden unchecked goals survive status changes and restore to sparse storage', async () => {
  const { journal, db } = await journalWithBuiltIns();
  const key = 'pl-legal-appeal';
  await journal.roadmap.setGoalHidden('pl', key, true);
  assert.deepEqual(await journal.roadmap.getGoalStatuses('pl'), {});
  await journal.roadmap.setGoalStatus('pl', key, 'not-my-path');
  await journal.roadmap.setGoalStatus('pl', key, 'unchecked');
  assert.deepEqual(await journal.roadmap.getHiddenGoals('pl'), [key]);
  await journal.roadmap.setGoalHidden('pl', key, false);
  await journal.roadmap.setGoalHidden('pl', key, false);
  assert.equal((await db.query<{ n: number }>('SELECT COUNT(*) AS n FROM roadmap_check'))[0].n, 0);
});
