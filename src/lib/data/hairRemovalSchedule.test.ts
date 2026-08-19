/* Days since each treatment area's last hair-removal session (phase 5
   ticket 08). Pure: no clock, no database, so every case here is a table of
   sessions and days. */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { daysSinceLastSession } from './hairRemovalSchedule.ts';
import { HAIR_REMOVAL_AREAS } from './hairRemovalAreas.ts';
import type { HairRemovalSession } from './types.ts';

const session = (epochDay: number, area: string): HairRemovalSession => ({
  id: `s-${epochDay}-${area}`,
  epochDay,
  area,
  method: 'laser',
  painRating: 2,
  cost: '',
  provider: ''
});

test('daysSinceLastSession has an entry for every area the vocabulary knows, even with no sessions at all', () => {
  const recency = daysSinceLastSession([], 100);
  assert.deepEqual(Object.keys(recency).sort(), [...HAIR_REMOVAL_AREAS].sort());
  assert.ok(Object.values(recency).every((days) => days === null));
});

test('daysSinceLastSession counts days back from the most recent session in each area', () => {
  const sessions = [session(90, 'legs'), session(95, 'chin'), session(98, 'chin')];

  const recency = daysSinceLastSession(sessions, 100);

  assert.equal(recency.chin, 2); // the later of the two chin sessions, 100 - 98
  assert.equal(recency.legs, 10);
  assert.equal(recency.abdomen, null);
});

test('daysSinceLastSession does not care what order the sessions arrive in', () => {
  const forward = daysSinceLastSession([session(95, 'underarms'), session(98, 'underarms')], 100);
  const backward = daysSinceLastSession([session(98, 'underarms'), session(95, 'underarms')], 100);

  assert.equal(forward.underarms, 2);
  assert.equal(backward.underarms, 2);
});

test('daysSinceLastSession counts a session logged today as zero days since', () => {
  const recency = daysSinceLastSession([session(100, 'bikini_line')], 100);
  assert.equal(recency.bikini_line, 0);
});
