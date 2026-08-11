# Import writes files first, swaps the database last, and never deletes

An import writes the archive's photo files to storage, then swaps the database
contents in a single transaction, then stops. It never deletes a photo file.
Reclaiming whatever is now unreferenced is left to the orphan sweep from ADR-0008.

## Why

REPLACE is the most destructive path in the app, and photo files sit outside the
SQL transaction that removes their rows. Deleting files up front means a failure
part way through leaves the user with neither their old photos nor the new ones,
on a device that by design has no other copy.

Ordering it this way makes every failure before the commit a no-op: the old journal
is completely intact and the only cost is some dead files until the next boot.
Photo filenames are uuid-based (ADR-0008), so newly written files cannot collide
with existing ones, which is what allows writing before deciding anything.

## Consequences

Import has no separate deletion mechanism to get right. The one sweep that already
has to exist for interrupted deletes covers the import case too.

## Amended by ticket 14: what an import refuses

An archive's rows are validated by the schema as they are written, inside the one
transaction, rather than by a validator ahead of it: a value the columns refuse - a
reminder with no rule, an entry with no day - rolls the whole import back, which is
the property this ordering already had to provide. Only the payload's shape is
checked up front, because a collection that is not an array fails as a TypeError
that reads like a bug rather than like a damaged file.

A reference the archive cannot resolve - an entry naming a gender dimension or a tag
the same archive does not carry - fails the import instead of being dropped. The
alternative is silent partial data loss in the middle of a restore, which is the one
outcome a backup exists to prevent. It also cannot happen to a file this app wrote:
an export reads every table at once.

Replace and Merge each live in `journal/restore.ts` rather than beside the snapshot
in `journal/archive.ts`, though both are the archive area. The two halves share
nothing but the wire format, and the ordering rule above is most of the file.
