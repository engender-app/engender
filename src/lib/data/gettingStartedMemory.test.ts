import { expect, test } from 'vitest';
import { crossesOnArrival, rememberCrossed } from './gettingStartedMemory.ts';

test('the first showing in a session animates nothing, a later one crosses only what is new', () => {
  expect(crossesOnArrival('milestones')).toBe(false);

  rememberCrossed([]);
  expect(crossesOnArrival('milestones')).toBe(true);

  rememberCrossed(['milestones']);
  expect(crossesOnArrival('milestones')).toBe(false);
  expect(crossesOnArrival('letters')).toBe(true);
});
