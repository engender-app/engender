# Reference data is mirrored in memory; entry data is queried asynchronously

Status: Accepted
Decided: 2026-08-11
Last reviewed: 2026-11-02
Supersedes: none

Preferences, gender dimensions, tag groups, milestones and the other small vocabularies are loaded once at boot into reactive state (`src/lib/data/live/reference.svelte.ts`) and refreshed after each write, so components read them synchronously. Entries, search, statistics and recap go through async query stores (`src/lib/data/live/journal.svelte.ts`) that re-run when a table they read is written.

## Why

The demo store made every read a synchronous function over a deeply reactive `$state` object. SQLocal runs in a worker and is always async, and `$derived` cannot await, so that pattern stops working on the real database.

Mirroring everything would keep every screen unchanged, but stats, streak-style counts, tag insights and search would run in JavaScript over arrays. That dissolves the reason SQLite was chosen over IndexedDB. Making everything async would add loading states to screens that do not need them. Reference data is tens of rows, never paginated and read by nearly every component, so mirroring it is cheap. Entry data is unbounded and is what needs SQL.

## Consequences

Entry lists, statistics, search and recap gain loading states, on the screens where OPFS and WASM latency is real anyway.

**The journal announces invalidation, not the screens.** `data/live/writes.ts` maps every journal mutation to the tables it writes, and every read to the tables it reads, and wraps the journal. `liveQuery(run)` takes no table list: the closure is handed a journal that records which operations it calls and resolves their tables from the registry. A hand-written list went stale in practice (a streak and a stock projection each missed a table it read, and nothing could fail on it). An operation with no registry entry is a compile error, not an assumed read: a read misfiled as a write costs one query, a write misfiled as a read shows stale data forever and looks like a Svelte bug.

`liveQueryWatchingOnly(tables, run)` is the one escape for a query that narrows on purpose. It has one call site, `WrappedHomeCard.svelte`, and its name is long so a forgotten table cannot pass for a deliberate one.

**The mirror is refreshed from SQLite after a write, not patched.** It runs one round trip behind. Patching would make it a second source of truth, which ADR-0003 refuses for preferences.

**Loading states are for the first read only.** A re-running query keeps its previous result, because after a write the data on screen is one round trip old, not absent.

History: built 2026-08, amended later (queries name no tables); folded into the body 2026-11-02. The Wrapped example is now limited to the Home card.