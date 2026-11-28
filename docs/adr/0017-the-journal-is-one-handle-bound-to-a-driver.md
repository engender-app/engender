# The journal is one handle bound to a driver

Status: Accepted
Decided: 2026-08-11
Last reviewed: 2026-11-02
Supersedes: ADR-0016 (merged in), ADR-0024 (merged in)

`openJournal` (`src/lib/data/journal/journal.ts`) takes a `SqliteDriver` and a photo file store and returns the journal: every area module (entries, tags, dimensions, milestones, photos, labs, reminders, stats, archive and the rest) composed behind one handle. The interface is uniformly async, free of Svelte runes and free of paraglide imports, and it mints every row's identity itself. One thin app-level module (`src/lib/stores/boot.svelte.ts`) constructs the instance at boot; tests construct their own over `src/lib/data/sqlite/test-support/node-sqlite-driver.ts`. Screens read vocabulary rows through `src/lib/data/vocabulary/vocabulary.ts`, never through the `reference.svelte.ts` mirror.

## Why

Before this, the repository modules reached an ambient `$state` singleton by import, so there was no seam to hand a database to and nothing to test. A factory gives tests a real driver and gives the app one place that decides which driver it has.

The Node tier is the reason for the shape. `vitest.config.ts` runs plain Node with no `$lib` alias and no Svelte plugin, and `src/lib/paraglide/` is generated and gitignored. A module that uses a rune or imports `$lib/paraglide/runtime` cannot be reached from `npm test`. Everything under `data/journal`, `data/sqlite`, `data/live/writes.ts` and `crypto/` therefore has to be expressible without either. The cost of the alternative (an alias plus a paraglide generation step before every run) is losing the property that a fresh clone runs the suite with no build.

The same split is why `src/lib/data/epochDay.ts` imports nothing and is fully tested, while `src/lib/data/dates.ts` binds `getLocale()` and formats, with no tests of its own. `dates.ts` looks like a pass-through and has been proposed for deletion by an outside reviewer (2026-08-11); it stays. Presentation logic that needs a test moves its arithmetic down into the core and returns numbers (years, months, days), and the i18n layer supplies the words. `setLocale()` reloads the page (`src/lib/data/prefs/store.svelte.ts`), so the locale is constant for a page's lifetime and binding it in one place loses nothing.

Vocabulary has the same kind of seam. The `reference` mirror answers which rows exist and stays live with table writes. `vocabulary` answers what the user sees: localized built-in wording, custom wording unchanged, metric labels in step with preferences. Two routes to the same data invite copying row access into every new screen. `tests/node/i18n/vocabulary-seam.test.ts` fails if anything under `src/routes` or `src/lib/components` imports `reference.svelte`. A getter a screen needs is added to `vocabulary.ts` first.

## Considered options

**A module-level current driver, set once at boot.** Cheapest at the call sites. Rejected: every test then shares one mutable global and needs a set-and-reset dance.

**A driver parameter on every function.** Honest and annoying: every signature and call site grows an argument, and it buys nothing a factory does not.

**Splitting by access mode instead of by domain area.** ADR-0004 mirrors reference data and queries entry data asynchronously, but that split cuts across the areas: tags are mirrored and entries are async, so `deleteTag` would reach across the module split to clean up entry links. Area boundaries survive a change of access mode; access-mode boundaries do not survive a change of area.

## Consequences

**Identity is minted inside.** User rows get minted uuids and built-ins get seeded keys (ADR-0002). Because the uuid exists before the insert, the journal reads the rowid back by uuid and never depends on `lastInsertRowid`. That is safe only while statements reach the connection in the order they were issued. The web worker takes messages in order; the Android driver pipelines its calls and the plugin owns the order (ADR-0089).

**Replace and merge are single operations**, not transactions callers compose. Built-ins reconcile by key in one idempotent operation (`journal/reconcile.ts`) that boot and a Replace import both call.

**Failures are loud.** An update that names an unknown id throws; a delete of an unknown id succeeds (ADR-0053).

**Owner saves include photo changes.** Saving an entry or milestone is one journal operation, including the photo additions, removals and replacement made in its editor; callers do not sequence calls to the photos area. New files land first, then one transaction updates the owner and its photo rows, and old files go after commit. A failed cleanup does not turn a committed save into a reported failure; the orphan sweep finishes it on a later boot. A milestone save that removes or replaces a photo removes every existing photo row for it first, which repairs the one-photo invariant if a direct caller left duplicates.

**Some areas read across the others.** `stats` never writes and never reads the clock: a range arrives as two epoch days and the streak takes today as an argument, because "today" is a local calendar day (ADR-0001). `archive` reads every table by travelling identity rather than rowid (ADR-0002); Replace and Merge live in the same module, since the inverse of a snapshot belongs beside it. Packing needs every photo's length before the first chunk is encrypted (ADR-0007), so `PhotoFileStore` has `size()`.

**The mirror sits above the journal**, hydrated through the `loadReferenceData` hook in `data/sqlite/boot.ts`. Folded search text is its own import-free module (`src/lib/data/fold.ts`), because its callers sit on both sides of the seam.

**`archive` is built on first use.** `journal.ts` composes everything in one call, which is a static import, and the archive pipeline is large and runs on no first screen. So `archive` resolves behind an `import()` through `journal/deferredArea.ts`, with the area's type still static. `live/writes.ts` walks `Object.entries(journal)` at boot, so the facade carries a written list of method names: a missing name is a compile error and `deferredArea.test.ts` compares the facade's keys to the eager area's. This is not a general wrapper, because splitting every area would trade clear modules for lazy ones plus a list each. An area that boot itself reaches (`reconcileBuiltIns`) is not a candidate.

History: amended 2026-08-13 (photos area), 2026-08-15 (stats area), 2026-08-19 (archive area), after an early architecture review (owner saves include photo changes), 2026-10-05 (deferred areas) and 2026-09-23 (statements keep order without waiting, see ADR-0089); absorbed ADR-0016 and ADR-0024 2026-11-02.