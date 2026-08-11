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
