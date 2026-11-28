# Import writes files first, swaps the database last, and never deletes

Status: Accepted
Decided: 2026-08-11
Last reviewed: 2026-11-02
Supersedes: none

An import writes the archive's photo and document files to storage, then swaps the database contents in one transaction, then stops. It never deletes an existing file. Reclaiming files the replaced journal no longer owns is left to the orphan sweep (ADR-0008). Validation of the archive's rows runs before any file is written.

## Why

Replace is the most destructive path in the app, and files sit outside the SQL transaction that removes their rows. Deleting files up front means a failure part way leaves the user with neither old files nor new ones, on a device that by design has no other copy. In this order every failure before the commit is a no-op: the old journal is intact and the only cost is some dead files until the next sweep.

## Consequences

Photo names are uuid-based but re-importing an archive repeats them. Colliding files get fresh names before any write. Incoming rows use those names, published inside the same transaction as the rest of the restore. Thumbnails follow their full file's new name, and encryption uses the replacement name as authenticated data at write time.

Merge leaves matched files alone, except that a newer row takes the archive's file under a fresh name (ADR-0098 owns which row wins). Replace installs the archive's bytes under the replacement names.

After a failure before the transaction starts, or when the transaction's ownership read proves them unused, unpublished replacements are removed. Once the transaction has started, a rejection does not prove rollback: COMMIT can persist without its acknowledgement reaching the caller. Files of unknown ownership wait for the sweep, which also retries any cleanup that failed. Cleanup failure never rejects a committed restore.

**What an import refuses.** Row validation (`journal/archiveRowValidation.ts`, `assertArchiveRows` and `assertArchiveReferences`, called from `verifyArchive` in `journal/restore.ts`) runs before file access or the transaction, so a damaged archive fails as `CorruptArchiveError` and not as a bare SQLite constraint error. It checks identities and types, safe numbers, selected stored values, cross-field rules, repeated identities and references to archive rows or built-ins. An older archive may omit both halves of a document link, but a link with only one half is corrupt. A full archive naming a dimension or tag found in neither its rows nor the built-ins fails before write, because dropping the value would silently lose part of an entry. SQLite still enforces what remains, and unexpected storage failures keep their own errors.

Replace and Merge live in `journal/restore.ts`, not beside the snapshot in `journal/archive.ts`. They share only the wire format, and the ordering rule above is most of the file.

History: amended 2026-09 (what an import refuses) and 2026-10 (Merge row rule superseded by ADR-0098); folded 2026-11-02; legacy-consult sentence dropped with `aliasLegacyConsults`.