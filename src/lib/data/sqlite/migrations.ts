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

export const migrations: Migration[] = [
  { version: 78, sql: BASELINE_SCHEMA },
  { version: 79, sql: SCHEMA_V79 }
];
