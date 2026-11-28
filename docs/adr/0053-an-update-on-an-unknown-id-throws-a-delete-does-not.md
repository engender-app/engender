# An update on an unknown id throws; a delete does not

Status: Accepted
Decided: 2026-09-03
Last reviewed: 2026-11-02
Supersedes: none

Every write that addresses a row by id answers the already-gone case the same
way in every area, and the answer differs by operation, not by area. An
**update** naming an id the journal does not hold throws. A **delete** naming
such an id succeeds and changes nothing. There are no exceptions.

## Reason

The asymmetry follows what the caller was trying to do.

An update carries new content for a row it believes exists. If the row is gone
the caller acted on something stale (an unread list, a sheet left open, a
typo'd key) and the write it meant cannot happen. Failing loudly is the only
honest answer, and `assertChanged` in `src/lib/data/journal/support.ts` is
there so a typo'd key and a successful write do not look alike.

A delete carries no content. It asks for a state, that this row is not in the
journal, and when the row is already gone that state holds. Throwing turns a
satisfied request into an error and makes every caller read first to learn
whether it may delete.

The rule was found, not chosen. Most id-addressed writes already behaved this
way and the tests asserted it in one sentence per area, "update by id, throw on
unknown ids and delete idempotently". A handful of deletes (doses, dose pauses,
stock entries, eras, wear sessions) threw, and those were the deviation.

### What decided it against the throwing deletes

The reason is invalidation. `announcing` in `live/writes.ts` bumps a table's
version only after a mutation resolves, never when it rejects, because a write
that threw changed nothing. That is right for an update and inverted for a
delete. A delete throws exactly when the row is already gone, so suppressing the
bump meant no live list re-read, and a row the database did not have stayed on
screen indefinitely. The throwing contract was the only one that could leave the
interface showing a row that is not there.

It was also invisible. Nothing observed a delete rejection, and
`ConfirmDeleteSheet` typed its handler `() => void`, so the type structurally
forbade a `.catch()`. The rejection surfaced as a page error, which fails a
whole walkthrough run. The sheet's `onConfirm` now returns `void | Promise<void>`
so a caller can catch and report a failure. In the running app a throw
converted a caller bug into an invisible rejection plus a stale row, which is
harder to notice than a silent no-op that at least refreshes the list. And
`stock.deleteEntry` already contained the no-op path, made unreachable by an
`assertChanged` in front of it.

Cost was lopsided too (flattening the few deviating deletes was a handful of
lines, where converting all the rest to throw inverted dozens of assertions and
rewrote the doc comments), but cost is not the reason. `opfs-file-store`'s
`remove` is deliberately quiet on a missing file for the same reason: both
`deleteEntry` and the sweep rely on it.

## Consequences

`assertChanged` guards updates only, and `delete-contract.test.ts` holds that no
delete calls it. It stays a bare `Error` and not one of the data tier's typed
classes, because nothing branches on it and its untypedness records that an
update on an unknown id is a bug to fix and not a condition to handle.

A caller deletes without checking first. A delete wrapped in an existence check
is now a smell.

A new area gets the delete half free from the shared `{toRow, upsert, delete}`
triple. An area that cannot use the triple (`eras`, whose pre-write guard is a
whole-table invariant with several conflict cases) still owes the contract, by
comment and test and not by construction.

The rule is stated where a caller arrives (the `Journal` interface) and where
someone writing a new area arrives (beside `assertChanged`).

The invalidation fact generalises beyond deletes: a rejected write bumps no
table version, so any path that treats a rejection as recoverable has to bump
by hand.

## Alternatives

- **Every delete throws.** Consistent, and defensible on the view that deleting
  nothing is as much a caller error as updating nothing. Rejected on the
  invalidation argument, and because no caller was catching the throws it
  already had, so the loudness bought nothing.
- **A documented split, some areas throwing and some not.** The split matched no
  principle. The deviating areas were single-statement deletes with no cascade,
  structurally identical to the ones that no-op.
- **A typed error so a caller can tell an already-gone row from a driver
  failure.** Speculative under the delete contract, since no delete throws, and
  unnecessary under the update contract, since no caller recovers. Revisit if a
  caller has a real reason to branch.

History: decided 2026-09-03; counts and deleted areas removed, `ConfirmDeleteSheet` handler type corrected 2026-11-02.