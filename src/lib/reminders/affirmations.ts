import { m } from '$lib/paraglide/messages';

/* The pool the daily check-in notification draws its affirming line from
   (phase 4 features ticket 22). Each language's set is authored in that
   language rather than translated from the other - an affirmation is short
   and emotionally loaded, exactly where a translated phrase reads stiff -
   so the sets deliberately do not correspond line by line, only in count
   (scripts/check-copy.mjs holds the catalogues to the same keys). */
const AFFIRMATION_MESSAGES = [
  m.affirmation_1,
  m.affirmation_2,
  m.affirmation_3,
  m.affirmation_4,
  m.affirmation_5,
  m.affirmation_6,
  m.affirmation_7,
  m.affirmation_8,
  m.affirmation_9,
  m.affirmation_10,
  m.affirmation_11,
  m.affirmation_12,
  m.affirmation_13,
  m.affirmation_14
] as const;

/** The whole pool in the app's current language. The native scheduler picks
    one line per day from it, so consecutive days rotate through the pool
    even when the app is not opened between them. */
export function affirmationLines(): string[] {
  return AFFIRMATION_MESSAGES.map((message) => message());
}
