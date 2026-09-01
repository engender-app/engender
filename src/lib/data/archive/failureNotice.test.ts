/* The scheduled-backup failure notice under the unprompted registry's rules
   (phase 6 ticket 04). The interesting case is the hold: unlike every other
   producer this one happens once, on a weekly schedule, so quiet hours have
   to remember it rather than let the next check catch it. */

import { describe, expect, it } from 'vitest';
import { exportFailureNoticeStep } from './failureNotice.ts';

const NIGHT = new Date(2026, 7, 11, 23, 30);
const MORNING = new Date(2026, 7, 12, 8, 0);
const QUIET = { enabled: true, start: '22:00', end: '07:00' };
const OFF = { enabled: false, start: '22:00', end: '07:00' };

const step = (over: Partial<Parameters<typeof exportFailureNoticeStep>[0]> = {}) =>
  exportFailureNoticeStep({ failedNow: false, held: false, enabled: true, quiet: OFF, at: MORNING, ...over });

describe('exportFailureNoticeStep', () => {
  it('posts a failure that happens outside quiet hours', () => {
    expect(step({ failedNow: true })).toEqual({ post: true, held: false });
  });

  it('holds a failure that happens inside quiet hours rather than dropping it', () => {
    expect(step({ failedNow: true, quiet: QUIET, at: NIGHT })).toEqual({ post: false, held: true });
  });

  it('posts a held notice on the first check after the window ends', () => {
    /* The tick that does this passes `failedNow: false` - nothing failed
       again, a week-old failure is simply still unsaid. */
    expect(step({ held: true, quiet: QUIET, at: MORNING })).toEqual({ post: true, held: false });
  });

  it('keeps holding while the window is still open', () => {
    expect(step({ held: true, quiet: QUIET, at: NIGHT })).toEqual({ post: false, held: true });
  });

  it('says nothing on a tick where nothing failed and nothing is held', () => {
    expect(step()).toEqual({ post: false, held: false });
  });

  it('drops a held notice when the kind is switched off, rather than posting it later', () => {
    /* Off is final rather than a snooze. Posting an hour later something the
       person switched off in between would be the switch failing to mean
       anything. */
    expect(step({ held: true, enabled: false, quiet: QUIET, at: MORNING })).toEqual({ post: false, held: false });
  });

  it('says nothing at all about a failure while the kind is off', () => {
    expect(step({ failedNow: true, enabled: false })).toEqual({ post: false, held: false });
  });

  it('posts at night when quiet hours are switched off', () => {
    // The window's own times are still set; nothing reads them while the
    // rule is off.
    expect(step({ failedNow: true, quiet: OFF, at: NIGHT })).toEqual({ post: true, held: false });
  });
});
