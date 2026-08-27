import assert from 'node:assert/strict';
import { test } from 'vitest';
import { MIN_PASSPHRASE_LENGTH } from '../journal-passphrase.ts';
import { archivePasswordProblem } from './password.ts';

test('an empty field is missing rather than too short', () => {
  assert.equal(archivePasswordProblem(''), 'missing');
});

test('anything under the journal floor is refused', () => {
  assert.equal(archivePasswordProblem('a'.repeat(MIN_PASSPHRASE_LENGTH - 1)), 'too-short');
});

test('the floor itself is accepted', () => {
  assert.equal(archivePasswordProblem('a'.repeat(MIN_PASSPHRASE_LENGTH)), null);
});
