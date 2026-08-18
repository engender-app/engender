/* Letter sealed/unlocked status (phase 4 ticket 19). */

import assert from 'node:assert/strict';
import { test } from 'vitest';
import { isLetterSealed } from './letterStatus.ts';

test('a letter is sealed strictly before its unlock day', () => {
  assert.equal(isLetterSealed({ unlockEpochDay: 200 }, 100), true);
});

test('a letter unlocks on its unlock day, and stays unlocked after it', () => {
  assert.equal(isLetterSealed({ unlockEpochDay: 200 }, 200), false);
  assert.equal(isLetterSealed({ unlockEpochDay: 200 }, 500), false);
});
