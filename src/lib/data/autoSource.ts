/* A Reminder's `autoSource` marker: `feature:id`, naming the thing that
   created the row so the app can keep it in step and say where it came from
   (ADR-0045). Three features write one today - medication stock
   (`stock:<drug>`), a wear session (`wear:<sessionId>`) and a regimen
   episode's dose schedule (`dose:<episodeId>`) - and a person who
   saves the row in the reminders editor clears it, at which point the row is
   indistinguishable from one they wrote themselves.

   Collected here, kept free of imports, because three modules had the same
   two literals: stock.ts and wearSessions.ts each built their own with a
   template string, provenance.ts re-declared both prefixes to read them
   back, and phase 6 ticket 04 needed a fourth reader on the Node tier, where
   provenance.ts's own `$lib/paraglide` import does not resolve (ADR-0016). A
   fourth copy of `'wear:'` is the kind of drift that shows up as a
   preference switch that silently stops matching the rows it gates. */

import { drugNameKey } from './regimenEpisode';

export const STOCK_PREFIX = 'stock:';
export const WEAR_PREFIX = 'wear:';
export const DOSE_PREFIX = 'dose:';

/** The marker medication stock puts on the run-out reminder it manages. */
export const stockAutoSource = (drug: string): string => `${STOCK_PREFIX}${drugNameKey(drug)}`;

/** The marker a wear session puts on its own elapsed prompt. */
export const wearAutoSource = (sessionId: string): string => `${WEAR_PREFIX}${sessionId}`;

/** The marker a dose schedule puts on each reminder it derives
    (functional audit ticket 21, doseReminders.ts). Keyed by the episode,
    since a schedule is one per episode and is upserted on it. */
export const doseAutoSource = (episodeId: string): string => `${DOSE_PREFIX}${episodeId}`;

/** Whether a reminder is a wear session's elapsed prompt rather than an
    ordinary one. `wearElapsedEnabled` gates exactly this subset: wanting
    medication reminders is not wanting to be told a binder has been on for
    eight hours. */
export const isWearAutoSource = (autoSource: string | null): boolean =>
  autoSource !== null && autoSource.startsWith(WEAR_PREFIX);
