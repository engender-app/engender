# The journal is one handle bound to a driver

A factory takes a `SqliteDriver` and a photo file store and returns the journal:
seven area modules (entries, tags, dimensions, milestones, photos, labs, reminders) composed
behind one handle. The interface is uniformly async and free of Svelte runes. It
mints every row's identity itself. One thin app-level module constructs the instance
at boot and exports it for the UI; tests construct their own.

## Why

The six repository modules currently reach an ambient `$state` singleton by import
(`import { db, save } from '../db.svelte'`, identically in all six), so there is no
seam to hand a database to and no way to test any of them. `boot()` goes to some
trouble to accept injected dependencies and is covered by six tests as a result, and
then `src/lib/stores/boot.svelte.ts` closes that seam again one layer up: it
constructs the driver itself and assigns it to `bootState.driver`, which nothing
reads.

Ticket 06 is the forcing function, not ticket 07. Preferences move into a `pref`
table, so 06 is the first module that needs a driver handle, and whatever it invents
becomes the precedent the other six inherit.

The interface has to be rune-free because `$state` is not defined in the Node tier -
`vitest.config.ts` has no Svelte plugin, verified by running a rune through it. This
is the same shape as ADR-0016: the Node tier can see neither paraglide nor Svelte's
runtime, so anything worth testing has to be expressible without either. It also
explains why `db.svelte.ts`, `boot.svelte.ts`, `ui.svelte.ts` and `toasts.svelte.ts`
have no tests between them.

## Considered options

**A module-level current driver, set once at boot.** Cheapest at the call sites,
which don't move at all. Rejected because every test then shares one mutable global
and needs a set-and-reset dance that the current 47-test Node tier does not.

**A driver parameter on every function.** Most honest and most annoying: around
thirty signatures and every call site grow an argument, and it buys nothing a
factory doesn't already give.

**Splitting by access mode rather than by domain area.** ADR-0004 mirrors reference
data and queries entry data asynchronously, which is a real split, but it cuts
across the areas: tags are mirrored and entries are async, so `deleteTag` would have
to reach across the module split to clean up entry links. Area boundaries survive a
change of access mode; access-mode boundaries do not survive a change of area.

## Consequences

**A `SqliteDriver` over `node:sqlite` lands before the first area module.** None
exists today: `makeNodeSqliteDb()` implements only `MigrationDb`, and the fake in
`boot.test.ts` has `query` and `run` that deliberately throw. Nothing in either tier
can currently run journal SQL. Building it also gives the driver seam its second
real adapter, which is what makes the seam real rather than hypothetical.

**Identity moves inside and `Date.now()` disappears.** Eight ad-hoc schemes exist
today, five in the repositories and three in screens (`EntryEditor.svelte`,
`settings/dimension/+page.svelte`, `settings/milestones/+page.svelte`), all of which
collide within a millisecond and none of which is the `uuid TEXT NOT NULL UNIQUE`
the schema requires. Per ADR-0002 that means minted uuids for user rows and seeded
keys for built-ins. Because the uuid is minted before the insert, the journal does
not need `lastInsertRowid`: it reads the rowid back by uuid. That avoids depending
on `run()`'s second round-trip, which is only safe while a driver serializes every
statement on one connection and is asserted by no test in either tier.

**Replace and merge are single operations, not transactions callers compose.**
Ticket 14's own framing is that order of operations is the whole ticket, and that
order belongs behind the interface. The same applies to reconciling built-ins by
key: one idempotent operation, called both on first run and during a Replace
import, so seeding and importing share code rather than resembling each other.

**Failures are loud.** Invariant violations and unknown ids on writes throw;
deletes are idempotent, so removing an already-gone row is success. Today five
mutators are `if (found) { mutate(); save(); }`, which makes a typo'd key and a
successful write indistinguishable to the caller.

**The mirror sits above the journal**, hydrated through the `loadReferenceData` hook
`boot.ts` already reserves at step 4 of a sequence `boot.test.ts` asserts exactly.
Folded text becomes its own import-free module below both, because its two callers
end up on opposite sides of this seam: the FTS index and query are inside the
journal, and ADR-0005's tag matching runs in memory against the mirrored vocabulary
above it.

**Two stores are live between tickets 06 and 07.** Preferences come from SQLite
while entries still come from `db.svelte.ts`, so `db.prefs` becomes a read-through
for that window. Landing 06 and 07 together would avoid it at the cost of one diff
spanning preferences, six areas, identity and the row mapping, which is the same
unreviewable-diff problem ticket 07 already defers async work to avoid.

**`types.ts` becomes the domain shape rather than the storage shape.** It currently
diverges from `SCHEMA_V1` on ids, `uuid`, `updated_at`, three join tables and four
column names. One divergence is not a mapping detail but a hard failure: the demo
store and seed produce `'EVERY_3_DAYS'` and `'EVERY_7_DAYS'`, and the schema's
`CHECK (recurrence IN ('DAILY','WEEKLY','EVERY_N_DAYS'))` rejects both on contact.

## Amended by ticket 11: a seventh area

Photos became the seventh area, `journal.photos`. An entry's photos and a
milestone's photo are the same rows in the same table, differing only in which
column the row hangs off, so splitting the write path across the entries and
milestones areas would have meant two implementations of an ordering rule that has
to hold identically in both. One area is what makes "the same table and the same
code path" true rather than aspirational.

The photo file store also stopped being optional. It was a defaulted parameter while
nothing wrote files, and defaulting it now would mean a journal that accepts a photo
and quietly has nowhere to put it.

## Amended by ticket 10: an eighth area

Stats became the eighth area, `journal.stats`. Aggregates read across entries,
dimension values, tags and milestones at once, so they belong to no single area,
and putting a day average on the entries area and a tag insight on the tags area
would have split one rule - what "the metric's value" is - across two modules. That
is the split that produced the mood x 20 disagreement the aggregates were rewritten
to end (ADR-0012).

Unlike the seven areas before it, this one never writes. It also never reads the
clock: a range arrives as two epoch days and the streak takes today as an argument,
because "today" is a local calendar day (ADR-0001) and the journal has no business
deciding which one it is.

## Amended by ticket 13: a ninth area

The archive became the ninth area, `journal.archive`. An export reads every table
at once, by travelling identity rather than by rowid (ADR-0002), which is not a
shape any of the eight areas above it speaks: the entries area addresses an entry
by the rowid that means nothing on another device, and a screen's getter can afford
a query per entry for its dimensions, tags and photos where an export over years of
them cannot. Ticket 14's Replace and Merge land in the same module, because the
inverse of a snapshot belongs beside it and both are single journal operations.

`PhotoFileStore` grew `size()` with it. An archive's chunk count has to be settled
before its first chunk is encrypted (ADR-0007), so packing needs every photo's
length up front, and the alternative - reading each photo once to measure it and
again to write it - is the cost the chunked format exists to avoid. OPFS answers it
from file metadata without touching the bytes.
