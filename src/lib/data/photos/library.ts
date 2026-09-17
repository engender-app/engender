/* What the photo library is made of, and how it narrows (phase 11 ticket
   14). Pure, so the node tier tests the rules and the screens draw them:
   the read itself is journal/photoLibrary.ts.

   The library is one list over six photo-carrying tables, and a person
   looking at it wants two questions answered that a single grid cannot
   answer on its own - where did this photograph come from, and show me
   only those. A source answers the first and a chip the second, and they
   are not the same vocabulary: "Body" is entry and milestone photographs
   together, because the person who took them was photographing themselves
   either way and which record it hangs off is the app's bookkeeping rather
   than theirs. "Hair" is the same trade over hair progress and hair
   removal.

   Colour says none of this. ADR-0012's rule for a wipe holds for a grid
   too: the tile carries its source as words, in the accessible name and in
   a label, never as a stripe that would rank one kind of photograph over
   another. */

import { localDateFromEpochDay } from '../epochDay';

/** Which table a photograph came from. `entry` and `milestone` are the two
    owners of the `photo` table; the rest each have one of their own
    (journal/photoLibrary.ts names them). */
export const PHOTO_SOURCES = [
  'entry',
  'milestone',
  'hair',
  'hairRemoval',
  'tryout',
  'procedure',
  'video'
] as const;

export type PhotoSource = (typeof PHOTO_SOURCES)[number];

/** One photograph in the library, whichever table holds it. `fileName` is
    a JPEG and its thumbnail for every source but `video`, whose file is
    the `.webm` a note was recorded into and has no thumbnail beside it. */
export interface LibraryPhoto {
  id: string;
  fileName: string;
  epochDay: number;
  source: PhotoSource;
  /** The owning record's own name, where it has one: a milestone's name, a
      tryout's label, a procedure's name. Null where the row hangs off
      nothing that is named - a hair photograph, a hair-removal session, an
      entry, a video note. */
  ownerName: string | null;
  /** The ID accepted by the owner's existing route. Hair photos own themselves. */
  ownerId: string;
  starred: boolean;
}

/** The chips over the grid, in the order they are drawn. `everything` is
    first because it is where the library opens. */
export const PHOTO_CHIPS = ['everything', 'body', 'hair', 'tryouts', 'surgery', 'video'] as const;

export type PhotoChip = (typeof PHOTO_CHIPS)[number];

/** Which chip a source answers to. Exhaustive by construction: a new source
    added to PHOTO_SOURCES without a line here fails to compile. */
const CHIP_OF: Record<PhotoSource, Exclude<PhotoChip, 'everything'>> = {
  entry: 'body',
  milestone: 'body',
  hair: 'hair',
  hairRemoval: 'hair',
  tryout: 'tryouts',
  procedure: 'surgery',
  video: 'video'
};

export function chipOf(source: PhotoSource): PhotoChip {
  return CHIP_OF[source];
}

/** The chip row for a library, or none at all.

    None when the whole library answers to one chip: "Everything" beside
    "Hair" over a grid of nothing but hair photographs is a control with
    one outcome, and a person tapping either gets the same grid. Two source
    chips is where narrowing starts to mean something, and that is where
    the row appears. */
export function chipsFor(photos: LibraryPhoto[]): PhotoChip[] {
  const present = new Set(photos.map((photo) => CHIP_OF[photo.source]));
  if (present.size < 2) return [];
  return PHOTO_CHIPS.filter((chip) => chip === 'everything' || present.has(chip));
}

/** The photographs one chip shows, in the order they came in. Literal: a
    chip the library holds nothing for narrows to nothing rather than
    falling back, because the fallback belongs to whatever read the chip
    out of the query (photoChipFromQuery below), where a stale link can
    still be answered with the whole library. */
export function narrowTo(photos: LibraryPhoto[], chip: PhotoChip): LibraryPhoto[] {
  if (chip === 'everything') return photos;
  return photos.filter((photo) => CHIP_OF[photo.source] === chip);
}

/** The chip a `?source=` names, or `everything` for anything else - an old
    link, a hand-typed value, a source key mistaken for a chip key. A
    library that opens on the whole of itself is never the wrong answer,
    which is why this narrows nothing rather than refusing. */
export function photoChipFromQuery(value: string | null | undefined): PhotoChip {
  return PHOTO_CHIPS.includes(value as PhotoChip) ? (value as PhotoChip) : 'everything';
}

export interface YearMark {
  year: number;
  /** The first photograph of that year, which is what the scrubber jumps
      to. An id rather than an index: the grid is keyed by id and a live
      query can change what stands at any index. */
  id: string;
}

/** The first photograph of each year the library spans, oldest first, or
    none when it spans a single year - a scrubber with one stop scrubs
    nothing. Reads the local calendar year (ADR-0001), the same day the
    tile prints. */
export function yearMarks(photos: LibraryPhoto[]): YearMark[] {
  const marks: YearMark[] = [];
  for (const photo of photos) {
    const year = localDateFromEpochDay(photo.epochDay).getFullYear();
    if (marks[marks.length - 1]?.year === year) continue;
    marks.push({ year, id: photo.id });
  }
  return marks.length < 2 ? [] : marks;
}

/** Opening an owner never hands a library projection to a write. */
export function photoOwnerHref(photo: LibraryPhoto): string {
  const id = encodeURIComponent(photo.ownerId);
  switch (photo.source) {
    case 'entry':
    case 'video': return `/entry/${id}`;
    case 'milestone': return `/transition/milestones?edit=${id}`;
    case 'hair': return `/body/hair-progress?photo=${id}`;
    case 'hairRemoval': return `/body/hair-removal?session=${id}`;
    case 'tryout': return `/transition/tryouts/${id}`;
    case 'procedure': return `/health/surgery?procedure=${id}`;
  }
}
