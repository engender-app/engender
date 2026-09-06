/* What a video note is allowed to be (ticket 22).

   Pure arithmetic, no browser: the caps are what videoRecording.ts asks
   getUserMedia and MediaRecorder for, and reencode.ts's target is worked
   out here so the decision to re-encode is under Node-tier tests rather
   than only observable in a file somebody has to measure.

   ADR-0008's photo reasoning applied to video, and harder. A photo is
   re-encoded on the way in because a few years of 4-12MB shots make the
   encrypted archive impractical to produce; 30 seconds of video is an
   order of magnitude worse per item, and there is no original kept to go
   back to either way. So the caps are fixed with no setting: nothing the
   user can turn up, because the thing being protected is the backup, not
   the picture. */

/** Ticket 22's fixed caps.

    "1080p" is a claim about the short edge, not about height: a phone held
    upright reports its track as 1080x1920, which is 1080p by any ordinary
    reading, and capping height at 1080 would squash it to 608x1080 - half
    the picture thrown away to honour a number that already described it. So
    the pair of caps is short edge 1080, long edge 1920, in whichever
    orientation the camera hands them over. */
export const VIDEO_MAX_DURATION_MS = 30_000;
/* VIDEO_MAX_SHORT_EDGE stays exported for its own test, and cross-checked in
   video-notes-probe.ts (AU-09 test-only review). */
export const VIDEO_MAX_SHORT_EDGE = 1080;
/* VIDEO_MAX_LONG_EDGE stays exported only for its own test (AU-09 test-only
   review). */
export const VIDEO_MAX_LONG_EDGE = 1920;

/** The size a stored video note may not exceed.

    10 MiB, which is roughly 20 normalized photos - accepted deliberately,
    the way ADR-0008 accepted lossiness, and weighed the same way: against
    archives becoming too large to export. It is the ceiling the capture
    rates below are chosen to sit under, not a limit that fires routinely. */
export const VIDEO_SIZE_CEILING = 10 * 1024 * 1024;

/** What MediaRecorder is asked for at capture. 2 Mbps at 1080p is a plain
    talking-head note rather than a good picture, which is the trade this
    file exists to make: 30 seconds of it lands near 7.9 MB, a quarter under
    the ceiling, so the re-encode below stays the exceptional path. Both are
    hints - MediaRecorder is free to overshoot, which is exactly why there
    is a post-capture check at all. */
export const VIDEO_CAPTURE_BITS = { video: 2_000_000, audio: 96_000 } as const;

/** The audio a re-encode keeps whatever else it gives up. Fixed rather than
    scaled with the video: a video note of a person talking is worth less
    with a soft picture than with mangled speech, so the picture is what
    absorbs the cut. */
/* REENCODE_AUDIO_BITS stays exported only for its own test (AU-09 test-only
   review). */
export const REENCODE_AUDIO_BITS = 64_000;

/** How much of the ceiling a re-encode aims at, leaving room for container
    overhead and for MediaRecorder overshooting its hint a second time. */
const REENCODE_HEADROOM = 0.85;

export interface VideoBitrates {
  videoBitsPerSecond: number;
  audioBitsPerSecond: number;
}

/** What getUserMedia is asked for. `max` rather than `ideal` or an exact
    value: 1080p is a ceiling, and a camera that only does 720p should be
    used at 720p rather than refused.

    Both dimensions are capped at the long edge rather than one at each,
    because a constraint cannot say "short edge 1080, long edge 1920" and a
    per-dimension cap would refuse one orientation or squash the other. In
    practice no camera offers a mode between 1920x1080 and 1080x1920, so this
    admits exactly the two 1080p orientations; frameSize below is what
    enforces the real rule on anything that slips past. */
export function videoCaptureConstraints(): { video: MediaTrackConstraints; audio: true } {
  return {
    video: { width: { max: VIDEO_MAX_LONG_EDGE }, height: { max: VIDEO_MAX_LONG_EDGE } },
    audio: true
  };
}

/** The size a stored frame is drawn at: inside both caps, in whichever
    orientation it arrived, with the aspect ratio kept and never upscaled.

    Never upscaling is normalize.ts's rule for the same reason (ADR-0008):
    there is no detail left to recover, so a bigger draw only buys a softer
    picture and a bigger file. A capture already inside the caps keeps its own
    size - re-encoding is about bitrate, not about resolution. */
export function frameSize(width: number, height: number): { width: number; height: number } {
  const shortEdge = Math.min(width, height);
  const longEdge = Math.max(width, height);
  const scale = Math.min(1, VIDEO_MAX_SHORT_EDGE / shortEdge, VIDEO_MAX_LONG_EDGE / longEdge);
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/** The rates to re-encode at, or null when the captured file already fits.

    One pass is enough, and the arithmetic is why. A file over the ceiling at
    duration D was necessarily written at more than CEILING*8/D bits per
    second, so a target of CEILING*8/D scaled by the headroom is always
    strictly below the rate that produced the oversized file - there is no
    input for which this asks the encoder to make the file bigger, and
    nothing to iterate on.

    `durationMs` is the caller's own wall-clock measurement, not the file's:
    WebM out of MediaRecorder carries no duration at all. A caller that has
    none gets the full 30 seconds assumed, which is the lowest target and so
    the safest guess. */
export function reencodeTarget(byteLength: number, durationMs: number): VideoBitrates | null {
  if (byteLength <= VIDEO_SIZE_CEILING) return null;
  const seconds = (durationMs > 0 ? durationMs : VIDEO_MAX_DURATION_MS) / 1000;
  const total = Math.floor((VIDEO_SIZE_CEILING * 8 * REENCODE_HEADROOM) / seconds);
  return {
    videoBitsPerSecond: total - REENCODE_AUDIO_BITS,
    audioBitsPerSecond: REENCODE_AUDIO_BITS
  };
}
