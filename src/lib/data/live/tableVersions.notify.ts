/* The rune-free half of the tableVersions seam (ticket 27): the
   write-announcement notify.

   `tableVersions.svelte.ts` owns the reactive version state and, being
   rune-bearing, cannot be reached by the Node tier (`$state` is not defined
   there, ADR-0017) - the same reason writes.ts is split out from
   journal.svelte.ts. The subscribe/announce rule the reference mirror leans
   on has no runes in it, so it lives here where a Node test can exercise it.

   After a write, `tableVersions.bump` announces through the shared instance;
   the mirror in reference.svelte.ts subscribes with `onTablesWritten` to
   re-read what it holds. Queries need nothing from here - the version bump
   reaches them through `$state`. */

import type { TableName } from './writes';

export type TablesListener = (tables: TableName[]) => void;

export interface WriteAnnouncer {
  /** Register a listener called after every announced write. */
  onTablesWritten(listener: TablesListener): void;
  /** Tell every listener which tables a write just touched. */
  announce(tables: TableName[]): void;
}

/** A fresh registry. The app uses the single shared one below; the factory
    exists so a Node test can exercise the rule without leaking listeners
    between cases. */
export function createWriteAnnouncer(): WriteAnnouncer {
  const listeners = new Set<TablesListener>();
  return {
    onTablesWritten: (listener) => {
      listeners.add(listener);
    },
    announce: (tables) => {
      for (const listener of listeners) listener(tables);
    }
  };
}

const shared = createWriteAnnouncer();

/** Register a listener called after every announced write, with the tables it
    wrote. */
export const onTablesWritten = shared.onTablesWritten;

/** Announce that a write touched these tables. Called by `tableVersions.bump`
    after it has bumped their versions. */
export const announceTablesWritten = shared.announce;
