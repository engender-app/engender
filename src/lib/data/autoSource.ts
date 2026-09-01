/* A Reminder's `autoSource` marker: `feature:id`, naming the thing that
   created the row so the app can keep it in step and say where it came from
   (CONTEXT.md, ADR-0045). Two features write one today - medication stock
   (`stock:<drug>`) and a wear session (`wear:<sessionId>`) - and a person who
   saves the row in the reminders editor clears it, at which point the row is
   indistinguishable from one they wrote themselves.

   Collected here, kept free of imports, because three modules had the same
   two literals: stock.ts and wearSessions.ts each built their own with a
   template string, provenance.ts re-declared both prefixes to read them
   back, and phase 6 ticket 04 needed a fourth reader on the Node tier, where
   provenance.ts's own `$lib/paraglide` import does not resolve (ADR-0017). A
   fourth copy of `'wear:'` is the kind of drift that shows up as a
   preference switch that silently stops matching the rows it gates. */

export const STOCK_PREFIX = 'stock:';
export const WEAR_PREFIX = 'wear:';

/** The marker medication stock puts on the run-out reminder it manages. */
export const stockAutoSource = (drug: string): string => `${STOCK_PREFIX}${drug}`;

/** The marker a wear session puts on its own elapsed prompt. */
export const wearAutoSource = (sessionId: string): string => `${WEAR_PREFIX}${sessionId}`;

/** Whether a reminder is a wear session's elapsed prompt rather than an
    ordinary one. `wearElapsedEnabled` gates exactly this subset: wanting
    medication reminders is not wanting to be told a binder has been on for
    eight hours. */
export const isWearAutoSource = (autoSource: string | null): boolean =>
  autoSource !== null && autoSource.startsWith(WEAR_PREFIX);
