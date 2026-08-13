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

/** Called after every announced write, with the tables it wrote: bumps each
    named table's version so a `liveQuery` that depends on it re-runs, then
    announces the write so the mirror re-reads what it holds. */
export function bump(tables: TableName[]): void {
  for (const table of tables) versions[table] += 1;
  announceTablesWritten(tables);
}

/** A table's current version, read so that a `liveQuery` `$effect` takes it as
    a dependency and re-runs when the table is next written. */
export function versionOf(table: TableName): number {
  return versions[table];
}
