import { m } from '$lib/paraglide/messages';

/* The pool the daily check-in notification draws its affirming line from
   (phase 4 features ticket 22, widened to carry custom lines by phase 5
   ticket 15). Each language's built-in set is authored in that language
   rather than translated from the other - an affirmation is short and
   emotionally loaded, exactly where a translated phrase reads stiff - so
   the sets deliberately do not correspond line by line, only in count
   (scripts/check-copy.mjs holds the catalogues to the same keys). */
const AFFIRMATION_MESSAGES: readonly [key: string, message: () => string][] = [
  ['affirmation_1', m.affirmation_1],
  ['affirmation_2', m.affirmation_2],
  ['affirmation_3', m.affirmation_3],
  ['affirmation_4', m.affirmation_4],
  ['affirmation_5', m.affirmation_5],
  ['affirmation_6', m.affirmation_6],
  ['affirmation_7', m.affirmation_7],
  ['affirmation_8', m.affirmation_8],
  ['affirmation_9', m.affirmation_9],
  ['affirmation_10', m.affirmation_10],
  ['affirmation_11', m.affirmation_11],
  ['affirmation_12', m.affirmation_12],
  ['affirmation_13', m.affirmation_13],
  ['affirmation_14', m.affirmation_14]
];

/** The whole pool in the app's current language: every built-in line whose
    key is not in `hiddenBuiltInKeys` (CONTEXT: "Hidden"), followed by
    `customLines` - additive, never a replacement for the built-ins
    (CONTEXT: "Affirmation"). The native scheduler picks one line per day
    from it, so consecutive days rotate through the pool even when the app
    is not opened between them.

    Pure on purpose: which built-ins are hidden and which custom lines apply
    to the active language live in the reactive vocabulary mirror
    (ADR-0016), so the caller (+layout.svelte) resolves both before calling
    this, keeping the pool assembly itself testable with no journal or
    Svelte runtime. */
export function affirmationLines(
  hiddenBuiltInKeys: ReadonlySet<string> = new Set(),
  customLines: readonly string[] = []
): string[] {
  const builtIns = AFFIRMATION_MESSAGES.filter(([key]) => !hiddenBuiltInKeys.has(key)).map(([, message]) => message());
  return [...builtIns, ...customLines];
}
