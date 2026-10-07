/* The forward-only migration list (ADR-0006). Append new versions here;
   never edit a migration once it has shipped.

   Version 88 is the squashed baseline (after-release ticket 42, which
   replaced ticket 34's v78 baseline and the steps 79 to 88 after it), not a
   step: it builds the whole schema in one statement. It keeps the number the
   chain had reached, so a journal already on the current schema opens with
   nothing running against it - the runner sees `current === latestVersion`
   and never even loads this list.

   A journal left anywhere from 1 to 87 cannot be opened by this build. Only
   development builds ever wrote one, since no release had shipped, and that
   was the price of squashing before the 1.0.0 cutoff. From 1.0.0 on, every
   released migration stays in the chain and cannot be edited or squashed.
   Such a journal is behind, not ahead, so SchemaTooNewError never fires for
   it. `baseline: true` is what lets the runner tell it apart from a first run:
   a journal with a schema below the baseline is refused with
   JournalBelowBaselineError before anything is copied or written, and the
   failure screen says it comes from a development build and offers the way
   out (after-release ticket 09). The journal is intact. Its content can still
   be carried over through an archive exported by the build that wrote it. */

import type { Migration } from './migration-runner.ts';
import { BASELINE_SCHEMA } from './schema.ts';

export const migrations: Migration[] = [{ version: 88, sql: BASELINE_SCHEMA, baseline: true }];
