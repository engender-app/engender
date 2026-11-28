import { describe, expect, test } from 'vitest';
import { claimPending, dropPending, holdPending } from './pendingPick';

describe('a pick that came back while the app was locked', () => {
  test('is claimed once, by the screen that asked, at the place it asked from', () => {
    holdPending('entry', '/entry/new', ['t1'], 1000);

    expect(claimPending('document', '/entry/new', 1001)).toBeNull();
    expect(claimPending('entry', '/somewhere/else', 1001)).toBeNull();
    expect(claimPending('entry', '/entry/new', 1002)).toEqual(['t1']);
    expect(claimPending('entry', '/entry/new', 1003)).toBeNull();
  });

  test('goes stale after ten minutes, so an editor opened later never inherits it', () => {
    holdPending('entry', '/entry/new', ['t1'], 0);

    expect(claimPending('entry', '/entry/new', 10 * 60_000 + 1)).toBeNull();
  });

  test('a newer pick replaces an older one, and dropping clears it', () => {
    holdPending('entry', '/a', ['old'], 0);
    holdPending('entry', '/a', ['new'], 1);
    expect(claimPending('entry', '/a', 2)).toEqual(['new']);

    holdPending('entry', '/a', ['x'], 3);
    dropPending();
    expect(claimPending('entry', '/a', 4)).toBeNull();
  });
});
