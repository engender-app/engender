/* What a photo journey export is made of, before any pixels exist (ticket
   27).

   The whole export is two steps the user takes separately: generate, then
   share. This module is everything the first step can decide without a
   canvas - which photos are in, how big the collage has to be, how long
   the timelapse will run, what the file ends up called - so the screen can
   show a count and a duration before anything is encoded, and so the
   geometry is under Node-tier tests rather than only visible in a picture
   somebody has to look at. journey-render.ts is the half that needs a
   browser.

   Nothing here reads or writes a photo file. The bytes it works out
   dimensions for are the ones normalize() already produced on import
   (ADR-0008: JPEG, 2048px on the long edge), which is all the export ever
   consumes - there is no original left to go back to (ADR-0015). */

import type { DatedPhoto } from '../journal/photos';
import { dateInputValueFromEpochDay, todayEpochDay } from '../epochDay';
import { nameSlug } from '../archive/deliver';

/** The two things a journey can be exported as. A collage is one composed
    image, a timelapse a video of the same photos in the same order. */
export type JourneyOutput = 'collage' | 'timelapse';

export interface JourneyRange {
  start: number;
  end: number;
}

/** The photos an export will actually use: inside the range, minus the ones
    the user turned off, oldest first.

    Chronology comes from the list rather than from a sort here, the same
    way compare-state.ts takes it: `photos.inJournal()` returns the journey
    in order, and filtering preserves it. Both ends of the range are
    inclusive, because both ends are days a person picked in a date field
    and would expect to see included. */
export function journeySelection(
  photos: DatedPhoto[],
  range: JourneyRange,
  excluded: string[]
): DatedPhoto[] {
  const off = new Set(excluded);
  return photos.filter((p) => p.epochDay >= range.start && p.epochDay <= range.end && !off.has(p.id));
}

/** The range that spans every photo there is, which is what the picker
    opens on, or null when there are no photos to span. */
export function journeyRangeBounds(photos: DatedPhoto[]): JourneyRange | null {
  if (photos.length === 0) return null;
  const days = photos.map((p) => p.epochDay);
  return { start: Math.min(...days), end: Math.max(...days) };
}

/* --- the collage ---------------------------------------------------------

   A contact sheet: square cells in chronological reading order, each with
   its date underneath. Square because the photos are not all the same
   shape and a grid of mixed aspect ratios has ragged holes in it - the
   cell crops to its centre (fitCover) instead.

   The nominal numbers below are what a short journey gets. A long one
   scales the whole layout down by one factor rather than growing without
   limit: a canvas has a maximum area, and it is smaller on a phone than on
   a desktop, so a three-year journey of 400 photos has to arrive at a
   picture that exists. */

/** The long edge no collage may exceed. Well inside the ~16M pixel area
    the oldest supported WebViews allow for a canvas, at any aspect ratio
    the grid produces. */
export const COLLAGE_MAX_EDGE = 4096;

const NOMINAL = { cell: 360, caption: 44, gap: 12, pad: 20, fontSize: 26 } as const;

export interface CollageLayout {
  columns: number;
  rows: number;
  /** The square photo area in a cell. */
  cell: number;
  /** The strip under each photo that holds its date. */
  caption: number;
  gap: number;
  pad: number;
  fontSize: number;
  width: number;
  height: number;
}

/** Geometry for a collage of `count` photos, at least one. */
export function collageLayout(count: number): CollageLayout {
  const columns = Math.ceil(Math.sqrt(Math.max(1, count)));
  const rows = Math.ceil(Math.max(1, count) / columns);

  const spread = (scale: number) => {
    /* Floor rather than round, so the scaled layout lands under the cap
       instead of a rounding error over it. Every piece keeps a pixel: a
       caption strip of zero height would drop the dates silently. */
    const scaled = Math.max(1, Math.floor(NOMINAL.cell * scale));
    return {
      columns,
      rows,
      cell: scaled,
      caption: Math.max(1, Math.floor(NOMINAL.caption * scale)),
      gap: Math.max(1, Math.floor(NOMINAL.gap * scale)),
      pad: Math.max(1, Math.floor(NOMINAL.pad * scale)),
      fontSize: Math.max(1, Math.floor(NOMINAL.fontSize * scale))
    };
  };

  const measure = (parts: Omit<CollageLayout, 'width' | 'height'>): CollageLayout => ({
    ...parts,
    width: parts.pad * 2 + columns * parts.cell + (columns - 1) * parts.gap,
    height: parts.pad * 2 + rows * (parts.cell + parts.caption) + (rows - 1) * parts.gap
  });

  const nominal = measure(spread(1));
  const overshoot = Math.max(nominal.width, nominal.height);
  if (overshoot <= COLLAGE_MAX_EDGE) return nominal;
  return measure(spread(COLLAGE_MAX_EDGE / overshoot));
}

/* --- the timelapse ------------------------------------------------------

   One square frame per photo, letterboxed rather than cropped: a timelapse
   is watched one photo at a time, so there is no grid to keep tidy and no
   reason to throw away the edges of a portrait shot.

   The frame rate is what MediaRecorder samples the canvas at, not how
   often the picture changes - each photo is held for MS_PER_PHOTO, so the
   sampled frames in between are duplicates, which is close to free in VP8. */

export const TIMELAPSE_EDGE = 1080;
export const TIMELAPSE_FPS = 10;
export const TIMELAPSE_MS_PER_PHOTO = 700;

/** How long the finished video runs, for the estimate the screen shows
    before anybody waits for it - the recording happens in real time, so
    this is also how long generating it takes. */
export const timelapseDurationMs = (count: number): number => count * TIMELAPSE_MS_PER_PHOTO;

/* --- fitting one rectangle into another --------------------------------- */

/** The whole photo inside the box, centred, with empty space on the two
    sides that run short. Used for a video frame, which has one fixed size
    whatever shape the photo is. */
export function fitContain(
  srcWidth: number,
  srcHeight: number,
  boxWidth: number,
  boxHeight: number
): { x: number; y: number; width: number; height: number } {
  const scale = Math.min(boxWidth / srcWidth, boxHeight / srcHeight);
  const width = srcWidth * scale;
  const height = srcHeight * scale;
  return { x: (boxWidth - width) / 2, y: (boxHeight - height) / 2, width, height };
}

/** The part of the photo that fills the box, taken from its centre - the
    source rectangle to hand drawImage, so the crop costs no intermediate
    canvas. Used for a collage cell, which is square. */
export function fitCover(
  srcWidth: number,
  srcHeight: number,
  boxWidth: number,
  boxHeight: number
): { sx: number; sy: number; sWidth: number; sHeight: number } {
  const scale = Math.max(boxWidth / srcWidth, boxHeight / srcHeight);
  const sWidth = boxWidth / scale;
  const sHeight = boxHeight / scale;
  return { sx: (srcWidth - sWidth) / 2, sy: (srcHeight - sHeight) / 2, sWidth, sHeight };
}

/* --- naming ------------------------------------------------------------- */

const EXTENSIONS: Record<JourneyOutput, string> = { collage: '.jpg', timelapse: '.webm' };

export const JOURNEY_MIME: Record<JourneyOutput, string> = {
  collage: 'image/jpeg',
  timelapse: 'video/webm'
};

/** `alicja-journey-2025-08-13.jpg`. Deliberately not exportFileName()'s
    `-journal-`: a collage of progress photos is not a copy of the journal,
    and someone with both files in a downloads folder has to be able to
    tell which is the backup. The slug is shared with it, though, because
    what survives a share sheet and a foreign filesystem is one question. */
export function journeyFileName(
  name: string,
  output: JourneyOutput,
  epochDay: number = todayEpochDay()
): string {
  const slug = nameSlug(name);
  return `${slug ? `${slug}-` : ''}journey-${dateInputValueFromEpochDay(epochDay)}${EXTENSIONS[output]}`;
}
