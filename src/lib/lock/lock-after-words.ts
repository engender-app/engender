/* The words for each lock timing (lock-timing ticket 01), in the three forms
   screens need: the choice itself, the fragment under the Security row, and
   the sentence under an unlock gate. Kept together, and each keyed on
   LockAfter, so a fifth timing is a type error in all three at once. */

import { m } from '$lib/paraglide/messages';
import type { LockAfter } from '../data/prefs/catalogue.ts';

export const lockAfterLabel: Record<LockAfter, () => string> = {
  immediately: () => m.lock_after_immediately(),
  'one-minute': () => m.lock_after_one_minute(),
  'five-minutes': () => m.lock_after_five_minutes(),
  restart: () => m.lock_after_restart()
};

export const lockAfterSub: Record<LockAfter, () => string> = {
  immediately: () => m.lock_after_sub_immediately(),
  'one-minute': () => m.lock_after_sub_one_minute(),
  'five-minutes': () => m.lock_after_sub_five_minutes(),
  restart: () => m.lock_after_sub_restart()
};

/** No sentence for a restart: that timing has no mid-session lock. */
export const lockAfterNote: Record<Exclude<LockAfter, 'restart'>, () => string> = {
  immediately: () => m.lock_after_note_immediately(),
  'one-minute': () => m.lock_after_note_one_minute(),
  'five-minutes': () => m.lock_after_note_five_minutes()
};
