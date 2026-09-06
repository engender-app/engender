/* The forward-only migration list (ADR-0006). Append new versions here;
   never edit a migration once it has shipped.

   Version 78 is the squashed baseline (ticket 34), not a step: it builds the
   whole schema in one statement, in place of the 78 that used to build up to
   it. It keeps the number those steps had reached, so a journal already on the
   current schema opens with nothing running against it - the runner sees
   `current === latestVersion` and never even loads this list.

   A journal left partway up the old chain cannot be opened by this build. That
   was the price of squashing, taken deliberately while no release had shipped;
   the runner refuses it as SchemaTooNewError or fails the baseline against
   tables that already exist, rather than doing anything quietly wrong. */

import type { Migration } from './migration-runner.ts';
import { BASELINE_SCHEMA } from './schema.ts';

export const migrations: Migration[] = [{ version: 78, sql: BASELINE_SCHEMA }];
