# A photograph is browsed in one library and owned by its own table

Status: Accepted
Decided: 2026-10-07
Last reviewed: 2026-11-02
Supersedes: none

Every photograph the journal holds is read back through one list,
`journal.photoLibrary.inJournal()`, whatever table the record it hangs off
keeps its rows in. That read is **a read and only a read**: it owns no
table and writes nothing. Each owning table keeps its own area, attach and
delete, and file ordering.

The sources are an entry's photos, a milestone's photos, hair photos,
hair-removal photos, tryout photos, procedure photos and video notes. The
`media_file` view owns the union over the file-owning tables, and each row
carries a source and a day (its own override, else its record's day). A
trashed entry hides its photos and notes. The other owners have no trash
state.

## Why the library is not `photos.inJournal()`

`photos.inJournal()` returns `photo` rows, and its callers hand them
straight back to `photos.remove()`, `photos.setStarred()` or a count: the
demo seed, the full fixture, the long-journal generator test and the
archive probe. Hand a hair photograph to `photos.remove()` and it deletes
no row, reports success and leaves its files for the orphan sweep. The
rule underneath: the list a person browses and the row an area owns are
different things, and only one may be handed back to a write.

## Why the sources are not the chips

The chips are Everything, Body, Hair, Tryouts, Surgery, Video and Starred
(`PHOTO_CHIPS` in `src/lib/data/photos/library.ts`). Body covers an
entry's and a milestone's photos, because photographing yourself is one
act whatever record the app hung it off. Hair covers progress and removal
for the same reason. Starred filters the existing flag across the source
chips and is the home of starred photos. A source is a fact about a row
and a chip is a question a person asks, and the mapping lives in one place.
A chip with nothing behind it is not drawn, and a library with one source
chip and no starred photos draws no chip row.

**Nothing about the source is said in colour.** ADR-0012 refuses a wipe
that says which photograph is better, and the same reasoning refuses a grid
that tints hair and surgery differently. Every tile says where it came from
in words, in its label and accessible name.

## A video note is in the library, and the recorder stays

A video note was recorded, played and exported and never found again except
through its day, so it needed a browse surface or no recorder. The maintainer took
the browse surface on 2026-09-16, and capture is unchanged (ADR-0033, which
absorbed the video-note capture decision).

Both consequences follow from `.webm` not being a JPEG:

- **A note is never an anchor of the wipe.** `PhotoWipe` reads JPEG bytes.
  A note's tile plays it in the app's own player.
- **A note is not in the journey export.** The collage and timelapse decode
  every frame as a photograph, so the export grid omits Video.

A note's tile draws a glyph, not a still. A stored poster frame would be
derived state (ADR-0010), and decoding one would read up to 10 MiB per tile
(`src/lib/data/videoNotes/limits.ts`) on a screen built to stay cheap.

## Starring and day editing stop where the column is

`starred` and `epoch_day_override` are columns only `photo` has.
`journal.photoLibrary.starred()` is that one arm in the library's shape,
and the day editor appears on an entry's and a milestone's tiles only.
Starring a hair photograph would be a migration, an archive round trip in
both directions and a control that does not exist, so it is a schema
change and not a read.

## Consequences

A new photo-holding table owes three things: a source in the
`media_file` view and `photoLibrary.ts`, a source with its chip in
`photos/library.ts`, and a label in `vocabulary/photoLibraryLabels.ts`.
The last two are total records over their key, so missing either is a
typecheck failure.

The count above the grid is the length of the list the grid draws, so
"every photo in your journal" is checkable on the screen that says it.

History: decided 2026-10-07; video notes joined the library 2026-09-16; starred photos became the Starred chip in October; trimmed 2026-11-02.

Amended 2026-11-26: hair photos are progress photos in the Hair pose (schema 124), so the library has no hair source; the Hair chip covers hair-removal photos only, and hair-pose progress photos answer to Progress.
