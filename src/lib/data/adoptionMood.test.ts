import { test } from 'vitest';
import assert from 'node:assert/strict';
import { adoptionMood } from './adoptionMood';

test('no readings give no mood to carry over', () => {
  assert.equal(adoptionMood([]), null);
});

test('the step chosen most often is the one carried over', () => {
  assert.equal(adoptionMood([{ mood: 2 }, { mood: 5 }, { mood: 5 }]), 5);
});

test('a tie goes to the step read most recently, not to the lowest one', () => {
  // Newest first: two "great" and two "poor", the latest of them "great".
  assert.equal(adoptionMood([{ mood: 5 }, { mood: 1 }, { mood: 1 }, { mood: 5 }]), 5);
  // And the other way round, so the rule is recency and not the top of the scale.
  assert.equal(adoptionMood([{ mood: 1 }, { mood: 5 }, { mood: 5 }, { mood: 1 }]), 1);
});
