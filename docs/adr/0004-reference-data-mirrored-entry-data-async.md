# Reference data is mirrored in memory; entry data is queried asynchronously

Preferences, gender dimensions, presets, tag groups and milestones are loaded once
at boot into reactive state and kept mirrored on write, so components read them
synchronously. Entries, search, statistics, tag insights and recap go through async
query stores that re-run when a relevant mutation commits.

## Why

The demo store made every read a synchronous function over a deeply reactive
`$state` object, so components could wrap reads in `$derived` and stay live for
free. SQLocal runs in a worker and is always async, and `$derived` cannot await, so
that pattern stops working on contact with the real database.

Mirroring everything in memory would preserve every screen unchanged, but stats
grouping, streaks, tag insights and search would go back to running in JavaScript
over arrays, which dissolves the reason the PRD chose SQLite over IndexedDB and
reduces SQLite to a save-file format. Making everything async would push loading
states onto screens that do not need them.

Reference data is bounded at tens of rows, is never paginated, and is needed by
nearly every component, so mirroring it is cheap. Entry data is unbounded and is
exactly what needs SQL.

## Consequences

Entry lists, statistics, search and recap gain loading states. This is a deliberate
exception to the rule that the SQLite port leaves screens unchanged, and it lands
on the screens where OPFS and WASM latency is real anyway.

## Built by ticket 08

The mirror is `data/live/reference.svelte.ts` and the query side is
`data/live/journal.svelte.ts`. Three details were decided while building it.

**Invalidation is per table, and the journal announces it, not the screens.** A
write bumps a version per table it wrote, and a query names the tables it depends
on. The alternative - a screen bumping what it thinks it invalidated - was rejected
because a call site cannot be relied on to know that saving an entry changes Home's
list, the streak, the calendar and the stats charts: miss one and it shows a stale
answer with nothing to indicate it. So `data/live/writes.ts` maps every journal
mutation to its tables and wraps the journal, which also makes the mapping testable
in the Node tier. An operation it does not classify throws on sight rather than
being assumed to be a read: a read misfiled as a write costs one needless query,
while a write misfiled as a read shows stale data forever and looks like a Svelte
bug.

**The mirror is refreshed from SQLite after a write, not patched in place.** It is
therefore one round trip behind - a renamed tag is stored before it is visibly
renamed. Patching would have made it a second source of truth, which is what
ADR-0009 already refused for preferences.

**Loading states are for the first read only.** A query keeps its previous result
while it re-runs, because after a write the data on screen is one round trip old
rather than absent, and replacing a list with a placeholder on every save would be
worse than the wait it reports.
