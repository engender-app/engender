/* Keep asynchronous journal reads reactive (ADR-0004). Screens use the
   journal handle. writes.ts maps calls to tables, and writes bump those
   tables' versions. liveQuery runs again when a table it read changes and
   stores its result in Svelte state.

   reference.svelte.ts mirrors synchronous reads through onTablesWritten.
   Table mapping, notification and read-state rules live in rune-free files
   so the Node tier can exercise them (ADR-0017). The browser walkthrough
   and live-reads-probe.svelte.ts cover effects with the real scheduler. */

import { untrack } from 'svelte';
import { useDoorActivity } from '$lib/navigation/doorActivity.svelte';
import { admitHiddenReads } from './hiddenReadAdmission';
import { firstResult } from './firstResult';
import { JOURNAL_WIDE, isJournalCommand, observeWrites, tablesReadBy, type TableName } from './writes';
import { emptyOf, gaveUp, landed, pending, rowsOf, type ReadState } from './readState';
import type { Journal } from '../journal/journal';
import { bump, settledVersionOf, versionOf } from './tableVersions.svelte';
import { callKey, forgetLastResults, recall, remember, sameAnswer } from './lastResults';
import { sessionGate } from './sessionGate';

export { onTablesWritten, batchWrites } from './tableVersions.svelte';

/* Held in an object rather than as a bare `let`: a module-level `$state`
   reassignment does not reach readers in other modules, and every reader of
   the journal is in another module. */
const open = $state<{ journal: Journal | null }>({ journal: null });

/* Same value as `open.journal`, reachable without a reactive read, behind
   the gate everything queues on until it lands. A screen that rendered during
   boot - Home's quick log is reachable at first paint - can then save without
   knowing whether the worker has caught up. The preference store solves the
   same problem by replaying writes; the journal only has to queue them,
   because nothing here needs an answer before the database has one.

   A gate rather than a promise resolved once since after-release ticket 10:
   a lock on the web closes the database, and the gate is what lets every
   call already running finish first, holds the ones made while locked, and
   hands them the reopened journal instead of the closed one. */
const journals = sessionGate<Journal>();

let wrapped: Journal | null = null;

/** Boot's job, once per open: wraps the journal so its writes announce
    themselves, and hands the wrapper back for boot's own use -
    `loadReferenceData` writes through it, so its announcements have to be
    observed too.

    Nothing may query yet. `openJournal()` only composes closures over the
    driver, and the tables do not exist until the migrations have run, which is
    what `journalIsOpen()` reports. */
export function attachJournal(raw: Journal): Journal {
  /* Answers read from another journal handle are not answers about this
     one (lastResults.ts). */
  forgetLastResults();
  wrapped = observeWrites(raw, bump);
  return wrapped;
}

/** Boot's other job: the database is open and migrated. Queries start running
    and queued calls go through. */
export function journalIsOpen(): void {
  if (!wrapped) throw new Error('the journal was reported open before it was attached');
  open.journal = wrapped;
  journals.open(wrapped);
}

/** The lock's half: stops handing the journal out,
    and resolves once every call already made through it has settled, so the
    database can close under nothing. Calls made from here on wait for the
    next `journalIsOpen()`. */
export async function journalIsClosing(): Promise<void> {
  open.journal = null;
  wrapped = null;
  await journals.close();
}

/** The lock's first, synchronous step on the web (security-scan ticket 08):
    the session is over for commands from this instant, before the close
    that drains it has even started. */
export function journalSessionEnded(): void {
  open.journal = null;
  journals.end();
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
          return journals.run((ready) => area(ready)[operation](...args), {
            command: isJournalCommand(areaName, operation)
          });
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
  get(_target, name: string) {
    // An operation on the journal itself, rather than an area of them: a
    // function to await the boot and call, not something to build a facade of
    // operations for. The list is writes.ts's, which needs the same
    // distinction (JOURNAL_WIDE).
    if ((JOURNAL_WIDE as readonly string[]).includes(name)) {
      const operation = name as (typeof JOURNAL_WIDE)[number];
      return (...args: unknown[]) =>
        journals.run((ready) => (ready[operation] as (...args: unknown[]) => unknown)(...args), { command: true });
    }
    return facadeFor(name);
  }
});

export interface LiveQuery<T> {
  /** The last result, or `undefined` until the first one lands. */
  readonly value: T | undefined;
  /** True until the first run settles. A re-run after a write keeps showing
      the previous result rather than flashing the skeleton again: what is on
      screen is one round trip old, not absent, and replacing a list with a
      placeholder on every save would be worse than the wait it reports. */
  readonly loading: boolean;
  /** True while the latest run is in flight, including its first retry. Adapters may omit it. */
  readonly running?: boolean;
  /** True when the most recent run rejected. */
  readonly failed: boolean;
  /** The last result remains visible after a refresh failure. */
  readonly stale: boolean;
  /** Request another read without discarding the last result. */
  retry(): void;
}

/** A read whose answer is a list, which is most of them.

    Same query underneath, with the two things every list call site was
    writing itself: rows already defaulted to an empty list, and `empty` as a
    state rather than a `.length` test that a still-loading read passes. With
    `failed` beside them, the three-state gate a screen renders is the read's
    own vocabulary rather than something the screen assembles. */
export interface LiveList<T> {
  /** The rows, `[]` until the first result lands. */
  readonly rows: T[];
  readonly loading: boolean;
  /** The read answered, and it answered with nothing. False while loading, so
      a screen cannot show its empty state over a read still in flight. */
  readonly empty: boolean;
  readonly failed: boolean;
  readonly stale: boolean;
  retry(): void;
}

/** Run the query again when a table it read changes. The journal proxy uses
    writes.ts to discover tables. Read reactive inputs before the first await
    so Svelte tracks them. An awaited journal call still records its tables,
    with discovery picked up one run later.

    Seed known tables from registry constants if a query must begin after an
    await. Seeding keeps automatic discovery active. Call during component
    initialization so the query effect follows that component's lifetime. */
export function liveQuery<T>(run: (journal: Journal) => Promise<T>, seed?: TableName[]): LiveQuery<T> {
  return query(null, run, seed ?? null, callSite());
}

/** `liveQuery` for a read whose first run should wait until `when` is true.
    It waits the way every query waits for the journal to open, and a write
    in the meantime waits with it. From its first run on it is an ordinary
    liveQuery: `when` is not asked again. The curve's model is the first: it
    waits for the screen to stop arriving. */
export function liveQueryWhen<T>(when: () => boolean, run: (journal: Journal) => Promise<T>): LiveQuery<T> {
  return query(null, run, null, callSite(), when);
}

/** `liveQuery` for a read that answers with a list: the same query, seen
    through `rows`/`loading`/`empty`/`failed` (readState.ts). What ReadGate
    takes, and what a screen holding rows of its own should ask for.

    A read that answers `undefined` - the checklist screens ask for a list
    that may not have been made yet - is no rows, the same as one that has
    not answered at all, but still counts as a successful empty result.
    `seed` is `liveQuery`'s own. */
export function liveList<T>(run: (journal: Journal) => Promise<T[] | undefined>, seed?: TableName[]): LiveList<T> {
  return listOf(query(null, (journal) => run(journal).then((rows) => rows ?? []), seed ?? null, callSite()));
}

/** The list inside a wider answer, gated like any other list.

    Not every read that a screen gates answers with a list. The exposure
    counters are one read holding three, and a tryout's entries are a page of
    rows beside a count that is not the page's length. Asking the journal a
    separate question per list would be three round trips where the screen
    needs one, so the read stays whole and this is the face of it ReadGate
    takes. `rows` is not called until there is an answer to call it on. */
export function liveListIn<T, V>(read: LiveQuery<V>, rows: (answer: V) => T[]): LiveList<T> {
  return listOf({
    get value() {
      const answer = read.value;
      return answer === undefined ? undefined : rows(answer);
    },
    get loading() {
      return read.loading;
    },
    get failed() {
      return read.failed;
    },
    get stale() {
      return read.stale;
    },
    retry: () => read.retry()
  });
}

/** `LiveQuery`'s value seen through readState's two list rules, so the
    defaulting exists once rather than in each of the two callers above. */
function listOf<T>(read: LiveQuery<T[] | undefined>): LiveList<T> {
  /* Rebuilt per access rather than held, so each getter reads the underlying
     `$state` itself and a template tracking `rows` alone is not woken by a
     change to `failed`. */
  const state = (): ReadState<T[]> => ({ value: read.value, loading: read.loading, failed: read.failed });
  return {
    get rows() {
      return rowsOf(state());
    },
    get loading() {
      return read.loading;
    },
    get empty() {
      return emptyOf(state());
    },
    get failed() {
      return read.failed;
    },
    get stale() {
      return read.stale;
    },
    retry: () => read.retry()
  };
}

/** A query that watches only `tables`, whatever its reads actually touch.

    The escape hatch from the paragraph above, for a screen that narrows on
    purpose: it uses one field of a wide answer and would rather not re-run for
    a write that cannot change that field. Wanted at exactly one call site
    (WrappedHomeCard, which reads a recap for its entry count), and the name is
    long so that a forgotten table can never be mistaken for this. Say why in a
    comment at the call site; nothing here can check that the narrowing is
    still true. */
export function liveQueryWatchingOnly<T>(
  tables: TableName[],
  run: (journal: Journal) => Promise<T>
): LiveQuery<T> {
  return query(tables, run, null, callSite());
}

/** Where `liveQuery` or `liveList` was called from, as a stack frame: the
    first half of a last-answer key (lastResults.ts). Taken two frames up -
    past this function and the exported one that called it - in both stack
    formats: V8 (Chromium, the Android WebView) opens with an "Error" line,
    Gecko does not. Null where there is no stack to read, which only turns
    the store off for that query. */
function callSite(): string | null {
  const lines = new Error().stack?.split('\n') ?? [];
  if (lines[0]?.startsWith('Error')) lines.shift();
  return lines[2]?.trim() || null;
}

let queriesMade = 0;
const liveQueries = new Set<number>();
const isLiveQuery = (instance: number) => liveQueries.has(instance);

/** How long a query's first-ever attempt waits before retrying a rejection,
    once, before reporting `failed` - long enough to cover "a
    couple of frames" at 60Hz with room to spare, short enough that a
    genuine failure isn't noticeably delayed. */
const FIRST_ATTEMPT_RETRY_DELAY_MS = 50;

function query<T>(
  narrowedTo: TableName[] | null,
  run: (journal: Journal) => Promise<T>,
  seed: TableName[] | null,
  site: string | null,
  when: () => boolean = () => true
): LiveQuery<T> {
  /* A warm revisit paints the answer this query gave last time, if nothing
     it read has been written since (lastResults.ts, ux-carpet 201). Asked
     here, while the component initialises, rather than in the effect: a
     value set by the effect lands a flush after the first render, and the
     read's skeleton and its reserve's crossfade would already be under way.
     The closure is run once against a journal that answers nothing, only to
     learn what it asks for. */
  const doorActive = useDoorActivity();
  const instance = ++queriesMade;
  liveQueries.add(instance);
  const asked = site && journals.current ? recallFor(site, run, journals.current) : null;
  const recalled = asked?.value;
  let state = $state<ReadState<T>>(recalled === undefined ? pending<T>() : landed(recalled as T));
  let inFlight = $state(false);
  /* The painted answer the first refresh compares against: equal, and the
     refresh assigns nothing, so nothing on screen re-renders or moves. */
  let painted: unknown = recalled;
  /* Only the newest run may write the result. Without this a fast re-run that
     overtakes a slow one - a search where "co" outruns "c" - would leave the
     older answer on screen for good. */
  let latest = 0;
  /* Whether the first run has started: `when` is asked only before it. */
  let started = false;
  let retries = $state(0);

  /* Every table this query has been seen to read. Filled by the recorder
     below as the closure calls its operations, and only ever grown: a query
     whose closure takes a different branch on a later run - a search box that
     is empty, a sheet that is closed - keeps the dependencies of the branch it
     took before, which is what makes an unwatched write impossible rather than
     merely unlikely. */
  const dependencies = new Set<TableName>(narrowedTo ?? seed ?? []);
  /* Bumped when a dependency turns up outside the synchronous part of a run,
     where reading its version cannot register with the effect. Reading this
     inside the effect is what makes the late discovery re-subscribe. */
  let discovered = $state(0);
  let recording = false;

  const dependOn = (area: string, operation: string) => {
    if (narrowedTo) return;
    for (const table of tablesReadBy(area, operation)) {
      if (recording) {
        dependencies.add(table);
        void versionOf(table);
      } else if (!dependencies.has(table)) {
        dependencies.add(table);
        discovered += 1;
      }
    }
  };

  $effect(() => () => {
    liveQueries.delete(instance);
  });

  $effect(() => {
    void discovered;
    void retries;
    for (const table of dependencies) void versionOf(table);
    const ready = open.journal;
    if (!ready) return; // still booting; this re-runs when the database opens
    /* Read only until the first run starts. After that a flip of `when` must
       neither run the read again nor drop, through the cleanup below, an
       answer still in flight. */
    if (!started && !when()) return;
    started = true;

    const mine = ++latest;
    inFlight = true;
    /* Only a query's very first attempt in its whole lifetime gets the grace
       below: every later run - an explicit retry(), a write-triggered
       re-run - reports a rejection immediately, exactly as before. */
    const firstEverAttempt = mine === 1;

    /* The versions this run starts from, and the key its synchronous calls
       make: what the answer is stored under once it lands. */
    let key: string | null = null;
    let calls: (string | null)[] = [];
    const startedAt = new Map<TableName, number>();

    const attempt = (): Promise<T> => {
      recording = true;
      calls = [];
      let running: Promise<T>;
      try {
        const admitted = untrack(() => admitHiddenReads(ready, doorActive, () => mine === latest));
        running = run(recordingJournal(admitted, dependOn, calls));
      } catch (error) {
        running = Promise.reject(error);
      } finally {
        recording = false;
      }
      key = site ? keyOf(site, calls) : null;
      startedAt.clear();
      for (const table of dependencies) startedAt.set(table, settledVersionOf(table));
      return running;
    };

    const settle = (result: T) => {
      if (mine !== latest) return;
      inFlight = false;
      /* A run that asked the journal nothing at all, before or after an
         await, answered from what the closure already had - an early return
         for a closed sheet or an empty selection - and is keyed as such. */
      if (key === null && site && calls.length === 0) key = `${site}|${NO_CALLS}`;
      if (key !== null && result !== undefined) {
        /* Stamped with the start versions of every table the query now
           knows it reads, including any discovered during this run. */
        const stamp: [string, number][] = [...dependencies].map((table) => [table, startedAt.get(table) ?? -1]);
        remember(key, result, stamp, instance, isLiveQuery);
      }
      const unchanged = painted !== undefined && sameAnswer(painted, result);
      painted = undefined;
      if (unchanged && !state.failed) return;
      state = landed(result);
    };

    const fail = (error: unknown) => {
      if (mine !== latest) return;
      inFlight = false;
      console.error('a journal query failed', error);
      state = gaveUp(state);
    };

    const running = attempt();

    /* Asked again with the first real run's key, when that differs from the
       one asked at initialisation. A closure whose arguments come from state
       an earlier `$effect` of the same component settles - Look back's plane
       reading picks its two axes that way - saw none of it at
       initialisation, returned early and asked for nothing. By this effect
       the state is settled, and the browser has still not painted, so an
       answer found now is still in the tab's first frame. */
    if (firstEverAttempt && site && untrack(() => state.loading)) {
      const now = key ?? (calls.length === 0 ? `${site}|${NO_CALLS}` : null);
      const again = now !== null && now !== asked?.key ? recallKey(now) : undefined;
      if (again !== undefined) {
        state = landed(again as T);
        painted = again;
      }
    }

    running.then(settle, (error) => {
      if (!firstEverAttempt) return fail(error);
      /* A route visited for the first time this session can reject once on
         its table's first touch and recover a couple of frames later.
         Reporting that as `failed` flashes the read's error
         Notice in and back out. One bounded retry after a beat gives the
         table a chance to settle before this query's first answer is
         trusted either way. */
      setTimeout(() => {
        if (mine !== latest) return;
        attempt().then(settle, fail);
      }, FIRST_ATTEMPT_RETRY_DELAY_MS);
    });
    return () => { latest += 1; };
  });

  return {
    get value() {
      return state.value;
    },
    get loading() {
      return state.loading;
    },
    get running() {
      return inFlight;
    },
    get failed() {
      return state.failed;
    },
    get stale() {
      return state.failed && state.value !== undefined;
    },
    retry() {
      latest += 1;
      retries += 1;
    }
  };
}

/** The journal a query's closure is handed: every operation announces itself
    to `dependOn` before it runs, and is otherwise the operation itself.

    A proxy rather than a wrapper built per area at boot, for the reason the
    facade above is one: the shape is the journal's own, and nothing here
    should have to be edited when an area gains a method. */
function recordingJournal(
  ready: Journal,
  dependOn: (area: string, operation: string) => void,
  calls?: (string | null)[],
  /* What a call answers with instead of the operation itself: the last-answer
     lookup (recallFor) passes a promise that never settles, so the closure
     stops at its first await having only said what it asks. */
  answer?: () => Promise<never>
): Journal {
  return new Proxy({} as Journal, {
    get(_target, areaName: string) {
      const area = ready[areaName as keyof Journal] as unknown as Operations;
      return new Proxy(
        {},
        {
          get(_areaTarget, operation: string) {
            /* Anything that is not an operation is handed back as it stands,
               the same way observeWrites leaves a non-function property alone:
               a proxy that answered every property with a function would make
               `await` on an area look like a thenable. */
            const implementation = area[operation];
            if (typeof implementation !== 'function') return implementation;
            return (...args: unknown[]) => {
              dependOn(areaName, operation);
              calls?.push(callKey(areaName, operation, args));
              return answer ? answer() : implementation.call(area, ...args);
            };
          }
        }
      );
    }
  });
}

/** The answer `run` gave last time, if it is still good (lastResults.ts).
    `run` is called against a journal whose every operation records itself
    and then never answers, so the closure stops at its first await and
    everything it called before then is the key. Nothing reaches the
    database. */
function recallFor(
  site: string,
  run: (journal: Journal) => Promise<unknown>,
  ready: Journal
): { key: string | null; value: unknown } {
  const calls: (string | null)[] = [];
  try {
    void run(recordingJournal(ready, () => {}, calls, () => new Promise(() => {}))).catch(() => {});
  } catch {
    return { key: null, value: undefined };
  }
  const key = calls.length === 0 ? `${site}|${NO_CALLS}` : keyOf(site, calls);
  return { key, value: key === null ? undefined : recallKey(key) };
}

const recallKey = (key: string): unknown =>
  recall(key, (table) => settledVersionOf(table as TableName), isLiveQuery);

/** What a closure that calls no operation at all is keyed under. A closure
    that calls one only after an await looks the same to the asking run
    above, and it finds nothing here unless one of its own runs once
    returned early without asking - a paint that its refresh then corrects.
    The one case the key cannot tell apart; lastResults.ts says why the
    others can. */
const NO_CALLS = '(no calls)';

/** The key for a run's synchronous calls, or null if there were none or one
    of them could not be written down. */
function keyOf(site: string, calls: (string | null)[]): string | null {
  return calls.length > 0 && !calls.includes(null) ? `${site}|${calls.join('|')}` : null;
}

/** Calls `fill` with a query's first result and never again.

    What the two editors need: they build a local draft from a stored row that
    is now a round trip away, and a re-run would discard everything the user
    had typed since. Like `liveQuery`, call it while a component is
    initialising. */
export function onFirstResult<T>(query: LiveQuery<T>, fill: (value: T | undefined) => void): void {
  const fillOnce = firstResult(fill);
  $effect(() => fillOnce(query));
}
