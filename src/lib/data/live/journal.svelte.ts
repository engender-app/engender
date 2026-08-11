/* The reactive layer over the journal (ticket 08, ADR-0004).

   The demo store made every read synchronous over a deeply reactive `$state`
   object, so a component wrapped it in `$derived` and stayed live for free.
   SQLocal runs in a worker and is always async, and `$derived` cannot await,
   so that pattern does not survive the port. This module is what replaces it
   for the async half:

     - `journal` is the handle screens read and write through. Same shape as
       the journal itself, so a call site looks like it did when it was calling
       a repository function.
     - every write announces its tables (writes.ts), which bumps a version per
       table.
     - `liveQuery` re-runs when a table it named bumps, and holds the result in
       `$state` so a template can read it synchronously.

   Invalidation is per table rather than global because the alternative is
   visibly wasteful: saving one lab result would re-run the stats charts, the
   streak, Home's entry list and whatever search is on screen. A table version
   is one integer and the scoping falls out of it.

   The mirrored half - reference data read synchronously - is
   reference.svelte.ts, which registers itself with `onTablesWritten` below.

   Nothing here is tested in the Node tier: `$state` is not defined there
   (ADR-0017), which is exactly why writes.ts holds the part with a rule in
   it. What this file adds beyond that is covered by
   `tests/walkthrough.test.mjs` driving the real screens. */

import { observeWrites, type TableName } from './writes';
import type { Journal } from '../journal/journal';

const TABLES: TableName[] = ['entry', 'tag', 'dimension', 'preset', 'milestone', 'photo', 'lab', 'reminder'];

const versions = $state<Record<TableName, number>>(
  Object.fromEntries(TABLES.map((table) => [table, 0])) as Record<TableName, number>
);

/* Held in an object rather than as a bare `let`: a module-level `$state`
   reassignment does not reach readers in other modules, and every reader of
   the journal is in another module. */
const open = $state<{ journal: Journal | null }>({ journal: null });

const listeners = new Set<(tables: TableName[]) => void>();

/* Same value as `open.journal`, reachable without a reactive read, plus the
   promise everything queues on until it lands. A screen that rendered during
   boot - Home's quick log is reachable at first paint - can then save without
   knowing whether the worker has caught up. The preference store solves the
   same problem by replaying writes; the journal only has to queue them,
   because nothing here needs an answer before the database has one. */
let openedJournal: Journal | null = null;
let announceOpened: (journal: Journal) => void;
const opened = new Promise<Journal>((resolve) => {
  announceOpened = resolve;
});

let wrapped: Journal | null = null;

/** Called after every journal write, with the tables it wrote. The mirror uses
    this to re-read what it holds; queries need nothing, because the version
    bump reaches them through `$state`. */
export function onTablesWritten(listener: (tables: TableName[]) => void): void {
  listeners.add(listener);
}

/** Boot's job, once: wraps the journal so its writes announce themselves, and
    hands the wrapper back for boot's own use - `loadReferenceData` writes
    through it, so its announcements have to be observed too.

    Nothing may query yet. `openJournal()` only composes closures over the
    driver, and the tables do not exist until the migrations have run, which is
    what `journalIsOpen()` reports. */
export function attachJournal(raw: Journal): Journal {
  wrapped = observeWrites(raw, (tables) => {
    for (const table of tables) versions[table] += 1;
    for (const listener of listeners) listener(tables);
  });
  return wrapped;
}

/** Boot's other job: the database is open and migrated. Queries start running
    and queued calls go through. */
export function journalIsOpen(): void {
  if (!wrapped) throw new Error('the journal was reported open before it was attached');
  openedJournal = wrapped;
  open.journal = wrapped;
  announceOpened(wrapped);
}

type Operations = Record<string, (...args: unknown[]) => unknown>;

/* One waiting facade per area, built once. Every operation returns a promise
   already, so the wait is invisible to the call site - which is the point: no
   screen holds a "has it booted yet" branch, and none of them did when the
   store behind this was synchronous. */
const facades = new Map<string, unknown>();

function facadeFor(areaName: string): unknown {
  const existing = facades.get(areaName);
  if (existing) return existing;
  const facade = new Proxy(
    {},
    {
      get(_target, operation: string) {
        return (...args: unknown[]) => {
          const area = (journal: Journal) => journal[areaName as keyof Journal] as unknown as Operations;
          if (openedJournal) return area(openedJournal)[operation](...args);
          return opened.then((ready) => area(ready)[operation](...args));
        };
      }
    }
  );
  facades.set(areaName, facade);
  return facade;
}

/** The one journal the UI reads and writes through (ADR-0017). Shaped like the
    journal itself, so a call site looks the way it did when it was calling a
    repository function. */
export const journal: Journal = new Proxy({} as Journal, {
  get(_target, area: string) {
    if (area === 'reconcileBuiltIns') return () => opened.then((ready) => ready.reconcileBuiltIns());
    return facadeFor(area);
  }
});

export interface LiveQuery<T> {
  /** The last result, or `undefined` until the first one lands. */
  readonly value: T | undefined;
  /** True until the first result lands. A re-run after a write keeps showing
      the previous result rather than flashing the skeleton again: what is on
      screen is one round trip old, not absent, and replacing a list with a
      placeholder on every save would be worse than the wait it reports. */
  readonly loading: boolean;
}

/** A query that re-runs whenever one of `tables` is written.

    `run` is called synchronously, so whatever it reads *before its first
    `await`* becomes a dependency alongside the table versions - which is how a
    query over an `epochDay` or a search box re-runs when those change. Reads
    after an await are invisible to Svelte; take them in the synchronous part.

    Must be called while a component is initialising, like any `$effect`: the
    query lives and dies with the component that asked for it. */
export function liveQuery<T>(tables: TableName[], run: (journal: Journal) => Promise<T>): LiveQuery<T> {
  let value = $state<T | undefined>(undefined);
  let loading = $state(true);
  /* Only the newest run may write the result. Without this a fast re-run that
     overtakes a slow one - a search where "co" outruns "c" - would leave the
     older answer on screen for good. */
  let latest = 0;

  $effect(() => {
    for (const table of tables) void versions[table];
    const ready = open.journal;
    if (!ready) return; // still booting; this re-runs when the database opens

    const mine = ++latest;
    run(ready).then(
      (result) => {
        if (mine !== latest) return;
        value = result;
        loading = false;
      },
      (error) => {
        if (mine !== latest) return;
        /* Logged and given up on rather than surfaced: the design has no error
           state for a single query, and a screen holding its placeholder
           forever tells the user less than an empty state does. A failure here
           means the database is unreadable, which +layout.svelte already
           reports from boot. */
        console.error('a journal query failed', error);
        loading = false;
      }
    );
  });

  return {
    get value() {
      return value;
    },
    get loading() {
      return loading;
    }
  };
}

/** Calls `fill` with a query's first result and never again.

    What the two editors need: they build a local draft from a stored row that
    is now a round trip away, and a re-run would discard everything the user
    had typed since. Like `liveQuery`, call it while a component is
    initialising. */
export function onFirstResult<T>(query: LiveQuery<T>, fill: (value: T | undefined) => void): void {
  let filled = false;
  $effect(() => {
    if (filled || query.loading) return;
    filled = true;
    fill(query.value);
  });
}
