# Photos are normalized to JPEG on import and originals are not kept

A photo added to an entry or a milestone is re-encoded to JPEG at a maximum of
2048px on the long edge, stored under an opaque `<uuid>.jpg` filename, and given a
stored thumbnail. The originally selected file is not retained.

## Why

Modern phone cameras produce 4 to 12 MB per shot, sometimes HEIC, which browsers
cannot reliably decode. Left as picked, a few years of progress photos make the
encrypted archive impractical to produce and share, which undermines the backup
health feature (F21) that exists because data loss is the biggest real risk in a
local-first app. 2048px is well above what the compare view (F27) or any export
needs, and without thumbnails the Progress photos screen decodes every full image
at once.

Filenames are opaque and resolved against a per-platform root because an absolute
OPFS path cannot round-trip to Android, and archives must import on either
platform.

## Consequences

**This is lossy and irreversible**, and it applies to photos whose whole purpose is
showing small changes over years. It was accepted deliberately, weighed against
archives becoming too large to export.

Photo files live outside the SQL transaction that deletes their rows, so a process
killed mid-delete leaves an unreferenced file. An orphan sweep runs on boot after
the database opens: list the directory, delete anything no row references.
