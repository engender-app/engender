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
import { nameSlug } from '../fold';

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

   The nominal numbers below are what a short journey gets. A long one scales
   the whole layout down by one factor rather than growing without limit: a
   canvas has a maximum area, and it is smaller on a phone than on a desktop,
   so a three-year journey of 400 photos has to arrive at a picture that
   exists at all. */

/** The pixel area no collage may exceed.

    Area rather than a long edge, because area is the limit a canvas actually
    has: mobile builds refuse one over about 16.7M pixels (2**24), and the
    dimension ceiling is an order of magnitude away from anything a grid of
    photos produces. Capping the edge at 4096 instead looked equivalent and
    was not - the grid is near square, so a 101-photo journey landed at
    4020x4087, which is 16.4M and inside the limit by two per cent. 12M keeps
    a real margin and still gives a 100-photo journey 300px cells. */
export const COLLAGE_MAX_AREA = 12_000_000;

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
  const area = nominal.width * nominal.height;
  if (area <= COLLAGE_MAX_AREA) return nominal;
  // Area goes as the square of the scale, so the scale is the square root.
  return measure(spread(Math.sqrt(COLLAGE_MAX_AREA / area)));
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

/* Neither of these ever scales a photo up, which is ticket 27's out-of-scope
   line ("upscaling beyond what the already-normalized source photos
   support") and the rule normalize.ts already follows for the same reason:
   there is no detail left to recover, so a bigger draw only buys a softer
   picture. A photo smaller than the frame sits smaller in it. */

/** Where the whole photo lands inside the box, centred, with empty space on
    the sides that run short. Used for a video frame, which is one fixed size
    whatever shape the photo is. */
export function fitContain(
  srcWidth: number,
  srcHeight: number,
  boxWidth: number,
  boxHeight: number
): { x: number; y: number; width: number; height: number } {
  const scale = Math.min(1, boxWidth / srcWidth, boxHeight / srcHeight);
  const width = srcWidth * scale;
  const height = srcHeight * scale;
  return { x: (boxWidth - width) / 2, y: (boxHeight - height) / 2, width, height };
}

/** The part of the photo that fills the box, taken from its centre, and where
    that part goes: a source rectangle and a destination rectangle for one
    drawImage, so the crop costs no intermediate canvas. Used for a collage
    cell, which is square.

    A photo too small to fill the box is contained rather than stretched, so
    the destination is not always the whole box - which is why this returns one
    instead of letting the caller assume it. */
export function fitCover(
  srcWidth: number,
  srcHeight: number,
  boxWidth: number,
  boxHeight: number
): { sx: number; sy: number; sWidth: number; sHeight: number; x: number; y: number; width: number; height: number } {
  const scale = Math.max(boxWidth / srcWidth, boxHeight / srcHeight);
  if (scale > 1) {
    const whole = { sx: 0, sy: 0, sWidth: srcWidth, sHeight: srcHeight };
    return { ...whole, ...fitContain(srcWidth, srcHeight, boxWidth, boxHeight) };
  }
  const sWidth = boxWidth / scale;
  const sHeight = boxHeight / scale;
  return {
    sx: (srcWidth - sWidth) / 2,
    sy: (srcHeight - sHeight) / 2,
    sWidth,
    sHeight,
    x: 0,
    y: 0,
    width: boxWidth,
    height: boxHeight
  };
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
