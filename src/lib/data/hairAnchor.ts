/* What the hair-progress screen counts weeks from (phase 4 ticket 09,
   widened by phase 5 ticket 33, put on HRT by functional audit ticket 18).
   Pure, kept above the journal seam: nothing here reads a clock or a
   database, and the anchor is never stored (ADR-0010) - the screen
   recomputes it from two preferences and the regimen on every read.

   Ticket 09 built this as the first dose logged against finasteride,
   dutasteride or minoxidil; ticket 33 widened it to the first dose of
   anything, so someone on testosterone watching their hairline move was not
   told to log a drug that would undo the change they came to track. That
   still let an SSRI logged a year before HRT start the count. Ticket 18
   anchors it where the effects timeline anchors:

   - A day the person set on this screen, which wins. It is the only anchor
     for someone tracking hair change with no HRT at all - laser,
     electrolysis, finasteride alone, or nothing.
   - Failing that, the HRT start: the date the person set on the regimen
     screen, else the earliest HRT episode (personalEffectWindow.ts's
     hrtAnchor).

   Null when neither exists: staging and photos go on working unanchored,
   they lose the framing. */

import type { HrtAnchor } from './personalEffectWindow';

/** The day the hair-progress timeline counts from, or null when there is
    nothing honest to count from yet.

    `userSetEpochDay` is the preference the person set (`hairAnchorEpochDay`,
    prefs/catalogue.ts) and is taken as given - day 0 is a date they chose,
    not an absent one, so this branches on null rather than on falsiness. */
export function hairAnchorEpochDay(userSetEpochDay: number | null, hrt: HrtAnchor | null): number | null {
  return userSetEpochDay ?? hrt?.startEpochDay ?? null;
}
