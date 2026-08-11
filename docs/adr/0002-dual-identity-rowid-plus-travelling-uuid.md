# Every row has two identities: a local rowid and a travelling key

User-created rows keep an `INTEGER PRIMARY KEY` for local joins and additionally
carry a `uuid TEXT NOT NULL UNIQUE` that travels in the export archive. Built-in
seeded rows are instead identified across devices by a stable `key`, which meant
adding a `key` column to `tag` and `gender_preset` alongside the ones
`gender_dimension` and `tag_group` already had.

## Why

The archive supports a MERGE import (F14) and a merge-only Daylio import (F28), and
an archive exported on one platform must import on the other. Autoincrement
integers cannot survive that: my entry 47 and the archive's entry 47 are different
entries, so merge would have to renumber every row and rewrite every foreign key,
and there would still be no way to tell "a row I already have" from "a new row",
making a repeated import silently double the journal.

Built-ins need the separate treatment because two devices seed them independently
and would mint different uuids for the same concept, so merging would produce a
duplicate of every built-in dimension, group, tag and preset. Keying them also
satisfies F25's requirement that seeded content be stored by key and localized at
display time, which a `label`-only tag table could not do.

## Considered options

Making UUIDv7 the actual primary key everywhere was rejected to keep the FTS5
`content_rowid` link and the join-heavy stats queries on integer rowids, which
matters at phone scale.

## Consequences

Merge matches on uuid for user rows and on key for built-in rows, and is therefore
idempotent: re-importing the same archive changes nothing.

Daylio CSV rows carry no identity of their own, which would make a re-imported CSV
duplicate the entire history and quietly break that guarantee. Daylio rows are
therefore given a uuid derived deterministically from their own content (date,
time, mood and note), so a repeated Daylio import is idempotent for the same
reason an archive import is.
