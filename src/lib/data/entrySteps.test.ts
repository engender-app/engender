/* A new entry's steps: which steps a person
   walks, in which order, and where an address that names a section lands.
   A step with nothing to show is not drawn, so the walk and the progress
   count only the steps this person will see. */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { arrivalStep, ENTRY_STEPS, nextStep, previousStep, sectionsOn, stepOfSection, stepsShown } from './entrySteps.ts';

const everything = { marks: true, body: true };

test('four steps in their fixed order, marking before writing', () => {
  assert.deepEqual(ENTRY_STEPS, ['today', 'marks', 'body', 'writing']);
  assert.deepEqual(stepsShown(everything), ['today', 'marks', 'body', 'writing']);
});

test('a step with nothing to show is skipped', () => {
  assert.deepEqual(stepsShown({ marks: false, body: true }), ['today', 'body', 'writing']);
  assert.deepEqual(stepsShown({ marks: true, body: false }), ['today', 'marks', 'writing']);
  assert.deepEqual(stepsShown({ marks: false, body: false }), ['today', 'writing']);
});

test('the step a person stands on stays in the walk while its content goes away', () => {
  assert.deepEqual(stepsShown({ marks: true, body: false }, 'body'), ['today', 'marks', 'body', 'writing']);
});

test('forward and back walk only the steps shown, and stop at the ends', () => {
  const shown = stepsShown({ marks: false, body: true });
  assert.equal(nextStep(shown, 'today'), 'body');
  assert.equal(nextStep(shown, 'body'), 'writing');
  assert.equal(nextStep(shown, 'writing'), null);
  assert.equal(previousStep(shown, 'writing'), 'body');
  assert.equal(previousStep(shown, 'body'), 'today');
  assert.equal(previousStep(shown, 'today'), null);
});

test('each folded section lives on one step', () => {
  assert.equal(stepOfSection('tags'), 'marks');
  assert.equal(stepOfSection('body'), 'body');
  for (const section of ['photos', 'voice', 'video'] as const) assert.equal(stepOfSection(section), 'writing');
  assert.deepEqual(sectionsOn('writing'), ['photos', 'video', 'voice']);
  assert.deepEqual(sectionsOn('today'), []);
});

test('an address naming a section lands on its step, or the next one shown', () => {
  assert.equal(arrivalStep(undefined, stepsShown(everything)), 'today');
  assert.equal(arrivalStep('photos', stepsShown(everything)), 'writing');
  assert.equal(arrivalStep('body', stepsShown(everything)), 'body');
  assert.equal(arrivalStep('tags', stepsShown({ marks: false, body: true })), 'body');
  assert.equal(arrivalStep('body', stepsShown({ marks: true, body: false })), 'writing');
});
