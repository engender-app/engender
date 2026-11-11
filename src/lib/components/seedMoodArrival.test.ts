import { describe, expect, it } from 'vitest';

import { moodToApply } from './seedMoodArrival';

/* The check-in notification can open a new entry on a face while a new entry
   is already open on another (tester report 02, ticket 03): the address
   changes to the new ?seedMood= and the editor, which read its seed once,
   kept the first pick. */
describe('a seedMood arriving on an open new entry', () => {
  it('applies a different mood, whatever the draft already holds', () => {
    expect(moodToApply(4, 2)).toBe(2);
    expect(moodToApply(null, 5)).toBe(5);
    expect(moodToApply(undefined, 1)).toBe(1);
  });

  it('leaves the draft alone when the seed did not change or went away', () => {
    expect(moodToApply(3, 3)).toBeNull();
    expect(moodToApply(3, null)).toBeNull();
    expect(moodToApply(null, null)).toBeNull();
  });
});
