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
