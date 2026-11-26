/* The pitch track a benchmark stores, so the take can be drawn again
   afterwards.

   Before this the tracker's output was summarized into six figures and
   dropped, which is why no benchmark taken before schema v58 can be
   redrawn. Two rejected alternatives:

     every frame        3000 floats for a thirty-second passage at the 10 ms
                        hop, which is more than any phone-width chart can
                        resolve and a hundred times what the picture needs.
     recompute on read  decoding the stored audio and re-running YIN on
                        every render is exactly what storing the figures was
                        chosen to avoid.

   So: four points a second, each the median of the frames beneath it. A
   thirty-second passage is about 120 points, which is roughly one per two
   pixels at the 390px floor - the resolution the drawing can actually use.

   Pure arithmetic over frames, like the rest of $lib/audio: no clock, no
   database, nothing from paraglide, so the Node tier proves it without a
   browser. */

import type { PitchFrame } from './pitch';
import { median } from './series';

/** Points per second in a stored track. Four, because the picture is the
    shape of a passage rather than its cycle-by-cycle detail, and because it
    is the coarsest rate at which a syllable is still a visible move. */
/* PITCH_TRACK_HZ stays exported only for its own test (AU-09 test-only
   review). */
export const PITCH_TRACK_HZ = 4;

const SECONDS_PER_POINT = 1 / PITCH_TRACK_HZ;

/** The longest track a stored benchmark can hold: twenty minutes at
    `PITCH_TRACK_HZ`, well past any passage a person reads. A longer string
    is not something this app wrote, and `decodePitchTrack` refuses it
    before it splits it. */
export const MAX_PITCH_TRACK_POINTS = 20 * 60 * PITCH_TRACK_HZ;
/** The range a stored point can sit in: the tracker searches 60 to 500 Hz
    (pitch.ts), widened a little for the sub-sample interpolation. */
const MIN_PITCH_TRACK_HZ = 50;
const MAX_PITCH_TRACK_HZ = 600;
/** Longest point as stored ("600.0") plus its comma. */
const MAX_PITCH_TRACK_CHARS = MAX_PITCH_TRACK_POINTS * 6;

/** Whether `stored` is a track this app could have written: under the point
    and character limits, every point empty or a plain decimal in range. */
export function isStoredPitchTrack(stored: string): boolean {
  if (stored.length > MAX_PITCH_TRACK_CHARS) return false;
  const fields = stored.split(',');
  return fields.length <= MAX_PITCH_TRACK_POINTS && fields.every((field) => {
    if (field === '') return true;
    if (!/^\d{1,3}(\.\d+)?$/.test(field)) return false;
    const hz = Number(field);
    return hz >= MIN_PITCH_TRACK_HZ && hz <= MAX_PITCH_TRACK_HZ;
  });
}

/** Hz to one decimal place in the stored text. Sub-decihertz precision is
    below what YIN resolves and below what a chart can draw, and it would
    double the column for nothing. */
const STORED_PLACES = 1;

/** The frames a take produced, as the track a row keeps. One point per
    quarter-second bucket: the median of that bucket's voiced frames, or
    null where the bucket held no voiced frame at all - a gap in the voicing
    is a gap in the drawn line, the same way the live trace breaks.

    Trailing holes are dropped. A take usually ends with the microphone
    still open for a moment, and a track whose last four points are holes
    would draw a passage that runs a second past where the voice stopped. */
export function downsamplePitchTrack(frames: readonly PitchFrame[]): (number | null)[] {
  const buckets: number[][] = [];
  for (const frame of frames) {
    if (frame.hz === null) continue;
    const at = Math.floor(frame.atSeconds / SECONDS_PER_POINT);
    (buckets[at] ??= []).push(frame.hz);
  }
  const points: (number | null)[] = [];
  for (let at = 0; at < buckets.length; at++) {
    points.push(buckets[at] ? median(buckets[at]) : null);
  }
  return points;
}

/** The track as the column holds it: one Hz value per point, comma
    separated, with an empty slot for a hole. Null when no point was voiced,
    which stores as no track rather than as an empty string - a benchmark
    whose passage held no voice at all never cleared the gate anyway.

    Text rather than packed floats on purpose (schema.ts's own note on
    the column): it is legible at the sqlite prompt, and a hundred-odd
    numbers is under a kilobyte either way. */
export function encodePitchTrack(points: readonly (number | null)[]): string | null {
  if (!points.some((hz) => hz !== null)) return null;
  return points.map((hz) => (hz === null ? '' : hz.toFixed(STORED_PLACES))).join(',');
}

/** A stored track back as frames, on the same shape the live trace uses so
    one figure component can draw either. Null - not an empty list - for a
    benchmark that has no track: those are every benchmark taken before
    schema v58, and the screen has to say so rather than draw an empty
    chart. */
export function decodePitchTrack(stored: string | null): PitchFrame[] | null {
  if (!stored) return null;
  /* Refused before the split: a string past the longest track allocates a
     point per comma, and one from an archive the app never wrote can be a
     hundred megabytes of them. */
  if (stored.length > MAX_PITCH_TRACK_CHARS) return null;
  return stored.split(',').map((field, at) => ({
    atSeconds: at * SECONDS_PER_POINT,
    hz: field === '' ? null : Number(field)
  }));
}
