/* Where in the last few seconds a voice was found.

   The reading step needs to say that a voice is arriving and being counted,
   and it cannot say it with a graph: pitch moves by design while somebody
   reads, the numbers come afterwards, and the figure that used to sit there
   was taking the room the passage needs (Alicja, 2026-09-04). What it can
   carry is presence - the one thing about a take that is true or not true
   at each moment, with no magnitude to scale and therefore no axis to read.

   So this reduces a window of pitch frames to the stretches that held a
   voice, as fractions of the window, and the screen draws them as one thin
   ribbon. Silence is a gap in it. Nothing at all is an empty rail, which
   is unmistakable and is the state somebody most needs to catch early.

   Why not a level meter, which is what a recorder usually shows: loudness
   is not what "recording successfully" means here. The gate's own checks
   already speak to level and to the room, in words, and a bar that wobbles
   with volume answers a question nobody asked while reading a passage
   aloud. Presence answers the one they did.

   Pure arithmetic over frames, like the rest of $lib/audio: no clock, no
   database, nothing from paraglide. */

import type { PitchFrame } from './pitch';

/** The narrowest a span may be drawn, as a fraction of the rail. One frame
    of a two-second window is half a per cent, which at the 390px floor is
    under two pixels and reads as nothing at all - so a moment the tracker
    did find a voice in would look like silence. Two per cent is about 7px
    there, which is a mark. */
export const MIN_SPAN_FRACTION = 0.02;

interface VoicedSpan {
  /** Fraction of the window where the stretch starts, 0 at the oldest
      frame on screen and 1 at the newest. */
  from: number;
  to: number;
}

/** The stretches of a frame window that held a voice.

    Widened to `MIN_SPAN_FRACTION` around their own middle where they are
    thinner than that, then merged where widening made two of them touch -
    so a ribbon never stutters at a place the voice did not, and never
    reports silence where the tracker found a frame. */
export function voicedSpans(frames: readonly PitchFrame[]): VoicedSpan[] {
  if (frames.length === 0) return [];

  const step = 1 / frames.length;
  const raw: VoicedSpan[] = [];
  let start: number | null = null;

  frames.forEach((frame, index) => {
    if (frame.hz !== null) {
      start ??= index;
      return;
    }
    if (start !== null) {
      raw.push({ from: start * step, to: index * step });
      start = null;
    }
  });
  if (start !== null) raw.push({ from: start * step, to: 1 });

  const widened = raw.map((span) => {
    const short = MIN_SPAN_FRACTION - (span.to - span.from);
    if (short <= 0) return span;
    const middle = (span.from + span.to) / 2;
    // Around its own middle, then slid back inside the rail rather than
    // clipped, so a span at either end keeps its full width.
    const from = Math.min(Math.max(0, middle - MIN_SPAN_FRACTION / 2), 1 - MIN_SPAN_FRACTION);
    return { from, to: from + MIN_SPAN_FRACTION };
  });

  return widened.reduce<VoicedSpan[]>((spans, span) => {
    const last = spans[spans.length - 1];
    if (last && span.from <= last.to) {
      last.to = Math.max(last.to, span.to);
      return spans;
    }
    spans.push({ ...span });
    return spans;
  }, []);
}
