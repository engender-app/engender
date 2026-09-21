/* The version-state half of the reactive layer, split out of
   journal.svelte.ts (ticket 27, ADR-0004).

   Every write announces its tables (writes.ts). This module turns that into
   two things: a version per table that a `liveQuery` re-runs on, and the
   write-announcement notify the reference mirror re-reads on. Both used to sit
   inside journal.svelte.ts next to the query runner and the boot wiring; the
   coupling made a hot path broad to retest and kept the query interface
   shallow.

   Rune-bearing, so the Node tier cannot import it - `$state` is not defined
   there (ADR-0017). The notify carries the only rule with no runes in it, so
   it lives rune-free in tableVersions.notify.ts, which this re-exports; the
   version bump and read are covered by the browser tier driving real
   screens. */

import { TABLE_NAMES, type TableName } from './writes';
import { announceTablesWritten } from './tableVersions.notify';

export { onTablesWritten } from './tableVersions.notify';

const versions = $state<Record<TableName, number>>(
  Object.fromEntries(TABLE_NAMES.map((table) => [table, 0])) as Record<TableName, number>
);

/** Set while `batchWrites` is running: `bump` collects tables here instead of
    touching `versions`, so a run of writes costs one re-run of whatever reads
    them rather than one per write (ticket 141 - a seed of a few thousand
    statements was re-querying Home's own liveQueries after every single one,
    and the query cost grows with the journal, which is what made the seed
    quadratic-ish on device). `null` when no batch is open. */
let batched: Set<TableName> | null = null;
let batchDepth = 0;

/** Called after every announced write, with the tables it wrote: bumps each
    named table's version so a `liveQuery` that depends on it re-runs, then
    announces the write so the mirror re-reads what it holds. Deferred to the
    end of the run while a `batchWrites` call is open. */
export function bump(tables: TableName[]): void {
  if (batched) {
    for (const table of tables) batched.add(table);
    return;
  }
  for (const table of tables) versions[table] += 1;
  announceTablesWritten(tables);
}

/** Runs `writes`, deferring every table version bump and mirror announcement
    it makes until it settles, then fires them once for the union of tables
    touched - so a screen reading any of them re-runs once instead of once per
    write inside. Nests: an inner call joins the outer batch rather than
    flushing early, so `resetDemoFull` can wrap a seed that itself wraps a
    clear without either flushing mid-run.

    The writes themselves still land one at a time and in order - this defers
    only the reactive announcement, never the data - so a read made through
    the raw (non-live) driver during the batch still sees each row as it is
    written. */
export async function batchWrites<T>(writes: () => Promise<T>): Promise<T> {
  const isOutermost = batchDepth === 0;
  if (isOutermost) batched = new Set();
  batchDepth++;
  try {
    return await writes();
  } finally {
    batchDepth--;
    if (isOutermost) {
      const tables = Array.from(batched!);
      batched = null;
      if (tables.length > 0) bump(tables);
    }
  }
}

/** A table's current version, read so that a `liveQuery` `$effect` takes it as
    a dependency and re-runs when the table is next written. */
export function versionOf(table: TableName): number {
  return versions[table];
}
