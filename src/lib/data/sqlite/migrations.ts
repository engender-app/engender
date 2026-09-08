/* The forward-only migration list (ADR-0006). Append new versions here;
   never edit a migration once it has shipped.

   Version 78 is the squashed baseline (ticket 34), not a step: it builds the
   whole schema in one statement, in place of the 78 that used to build up to
   it. It keeps the number those steps had reached, so a journal already on the
   current schema opens with nothing running against it - the runner sees
   `current === latestVersion` and never even loads this list.

   A journal left partway up the old chain cannot be opened by this build. That
   was the price of squashing, taken deliberately while no release had shipped.
   Such a journal is behind, not ahead, so SchemaTooNewError never fires for
   it: the baseline is pending, it runs against tables that are already there,
   and the step fails inside its transaction. Nothing is written and the
   pre-migration copy is left where it is (ADR-0006's ticket 04 amendment), so
   the failure is loud and the journal is intact, which is the most this can be
   made to do once the steps that would have carried it forward are gone. */

import type { Migration } from './migration-runner.ts';
import { BASELINE_SCHEMA } from './schema.ts';

/* v79: a lead time per drug, in days (redesign phase 10 ticket 01). Nullable
   and defaulted to NULL - every row recorded before this ticket has none
   typed, and the app assumes nothing rather than guessing a figure. Hangs off
   medication_stock rather than a second notion of a drug, per ADR-0046: it is
   already one row per drug. Feeds reorderByEpochDay (stockProjection.ts)
   alongside the run-out day the projection already computed; the projection
   itself is untouched. */
const SCHEMA_V79 = `
ALTER TABLE medication_stock ADD COLUMN lead_time_days INTEGER;
`;

/* v80: what kind of surgery a procedure is (phase 9 carpet ticket 17), so
   Dilation's gate on Surgery journey can read it instead of the placeholder
   ticket 16 shipped ("any procedure exists"). Defaulted to 'custom' rather
   than left nullable: every row recorded before this ticket becomes exactly
   what the editor now shows for an unset kind, and nothing reads a null
   kind as a fourth state.

   No CHECK, the same reasoning SCHEMA_V74's wear_session.kind gives: the
   write layer (procedures.ts) is the one writer, and a CHECK would refuse
   to even read back a row from an archive a newer build wrote with a kind
   this one does not know yet.

   `dilation_opt_in` only means anything for a `custom` kind - a compiled-in
   kind is not guessed to include dilation except vaginoplasty, which the
   gate checks by kind directly - but it is a plain column on every row
   rather than a nullable one scoped to `custom`, the same "one flag, most
   rows leave it at the default" shape wear_session's own booleans use. */
const SCHEMA_V80 = `
ALTER TABLE procedure ADD COLUMN kind TEXT NOT NULL DEFAULT 'custom';
ALTER TABLE procedure ADD COLUMN dilation_opt_in INTEGER NOT NULL DEFAULT 0;
`;

export const migrations: Migration[] = [
  { version: 78, sql: BASELINE_SCHEMA },
  { version: 79, sql: SCHEMA_V79 },
  { version: 80, sql: SCHEMA_V80 }
];
