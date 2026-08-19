/* The affirmations area (phase 5 ticket 15, CONTEXT: "Affirmation"):
   id-or-key addressing only, the same built-in/custom split tags.ts draws,
   built-ins hide and customs delete, loud failures on unknown write ids. */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { journalWithBuiltIns, UUID_PATTERN } from './test-support.ts';

test('a custom affirmation gets a minted uuid id, never a Date-based one', async () => {
  const { journal } = await journalWithBuiltIns();
  const line = await journal.affirmations.addLine('en', 'You are doing great.');
  assert.match(line.id, UUID_PATTERN);

  const stored = (await journal.affirmations.getAffirmations()).find((a) => a.id === line.id);
  assert.deepEqual(stored, { id: line.id, language: 'en', text: 'You are doing great.', builtIn: false, hidden: false });
});

test('the fourteen built-in lines are seeded by key, with empty text', async () => {
  const { journal } = await journalWithBuiltIns();
  const affirmations = await journal.affirmations.getAffirmations();
  const builtIns = affirmations.filter((a) => a.builtIn);

  assert.equal(builtIns.length, 14);
  assert.ok(builtIns.every((a) => a.text === '' && a.language === null && !a.hidden));
  assert.ok(builtIns.some((a) => a.id === 'affirmation_1'));
});

test('editing a custom line updates its text and throws on an unknown id', async () => {
  const { journal } = await journalWithBuiltIns();
  const line = await journal.affirmations.addLine('en', 'draft');
  await journal.affirmations.editLine(line.id, 'final');

  const stored = (await journal.affirmations.getAffirmations()).find((a) => a.id === line.id);
  assert.equal(stored?.text, 'final');

  await assert.rejects(journal.affirmations.editLine('nope', 'x'), /unknown/);
});

test('a built-in line cannot be edited', async () => {
  const { journal } = await journalWithBuiltIns();
  await assert.rejects(journal.affirmations.editLine('affirmation_1', 'x'), /built-in/);
});

test('hide addresses a built-in by key and throws on an unknown id', async () => {
  const { journal } = await journalWithBuiltIns();
  await journal.affirmations.setHidden('affirmation_1', true);

  const stored = (await journal.affirmations.getAffirmations()).find((a) => a.id === 'affirmation_1');
  assert.equal(stored?.hidden, true);

  await assert.rejects(journal.affirmations.setHidden('nope', true), /unknown/);
});

test('a built-in line cannot be deleted', async () => {
  const { journal } = await journalWithBuiltIns();
  await assert.rejects(journal.affirmations.deleteLine('affirmation_1'), /hide, not delete/);
});

test('deleting a custom line removes it; deleting twice is success', async () => {
  const { journal } = await journalWithBuiltIns();
  const line = await journal.affirmations.addLine('pl', 'linia');

  await journal.affirmations.deleteLine(line.id);
  assert.ok(!(await journal.affirmations.getAffirmations()).some((a) => a.id === line.id));

  await journal.affirmations.deleteLine(line.id); // idempotent
});
