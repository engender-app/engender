# Every row has two identities: a local rowid and a travelling key

Status: Accepted
Decided: 2026-08-11
Last reviewed: 2026-11-02
Supersedes: none

User-created rows keep an `INTEGER PRIMARY KEY` for local joins and also carry a `uuid TEXT NOT NULL UNIQUE` that travels in the archive. Built-in seeded rows (dimensions, tag groups, tags, presets) have a null uuid and a stable `key` instead. A row whose whole identity is content that is bundled with the app is matched on that content: a `roadmap_check` tick is the pair `(pack_key, goal_key)`. Daylio rows, which carry no identity, get a uuid derived from their own content.

## Why

An archive exported on one platform must import on the other, and Merge must tell "a row I already have" from "a new row". Autoincrement integers cannot do that: my entry 47 and the archive's entry 47 are different entries, and a repeated import would silently double the journal.

Built-ins need their own treatment because two devices seed them independently and would mint different uuids for the same concept. Merging on uuid would duplicate every built-in. A `key` also lets seeded content be stored by key and localized at display time.

## Considered options

UUIDv7 as the primary key everywhere was rejected. The FTS5 `content_rowid` link and the join-heavy stats queries stay on integer rowids, which matters at phone scale.

## Consequences

Merge matches on uuid for user rows, on key for built-ins and on the pair for ticks, so importing the same archive twice changes nothing. Which copy wins when both sides have a row is ADR-0098's rule.

A Daylio row's uuid is derived from date, time, mood and note (`journal/support.ts`, `contentUuid`), so a repeated Daylio import adds nothing. The Daylio CSV and the Daylio backup file derive different uuids, so importing both gives two copies.

`roadmap_check` records that someone ticked one goal of one bundled pack. It now carries a `status` and a `hidden` flag, so two devices can disagree about a pair. It stays keyed on the pair anyway: a uuid would not make that disagreement more resolvable, since a screen renders one checkbox per goal. `pack_key` has no CHECK against the packs a build ships, so adding or dropping a pack is not a migration, and a row left by a dropped pack is unreachable rather than broken.

A row that holds free text of its own is not a tick. A custom roadmap goal is `roadmap_goal`, a separate table with a uuid and its own `status`, because its row exists whether or not it is checked.

History: amended 2026-08 (roadmap ticks keyed on content) and 2026-09 (tick status widened, custom goals get their own table); folded into the body 2026-11-02.