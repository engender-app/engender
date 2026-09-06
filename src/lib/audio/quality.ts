/* The quality gate a take has to get through before its numbers mean
   anything (CONTEXT: "Voice benchmark").

   A benchmark is comparable to the ones before it only if the conditions
   were the same, so this is the module that decides a take is not worth
   storing. It names which check failed, in the caller's terms rather than in
   decibels, because the retake has to be able to say what to do differently:
   "further from the microphone" is actionable, "peak 0.99" is not.

   Nothing here is a judgement about a voice (PRODUCT.md:109). Every check is
   about the recording - level, room, length, steadiness - and a take that
   fails one is a take to make again, never a voice that fell short. The
   pitch graph's reference bands are the one narrowing of that rule, and
   for nothing else: no check in here gained a range, and none will.

   Pure, like its siblings, and it takes the pitch track rather than
   recomputing it (see resonance.ts's header for why).

   **The gate and the measuring are separate, and the measuring is a running
   total.** `assessQuality` applies the thresholds to a `QualitySignals` and
   nothing else. Two things produce one: `takeSignals`, over a whole decoded
   take, and the live gauge (audio/live.ts), which never has the whole take in
   hand and keeps the same numbers running as frames complete. One
   accumulator behind both, so the bar somebody watched and the verdict on
   the take that got stored cannot disagree. */

import { frameGeometry, rms, type PitchTrack } from './pitch';

/** Full scale is 1.0, so a peak this close to it means samples were very
    likely already flattened against the rails by the time they arrived. */
export const PEAK_CEILING = 0.98;
/** Voice against room, in dB. Below this the formant estimate starts
    describing the room. */
export const MIN_SNR_DB = 15;
/** Continuous voicing, in seconds. Continuous, not total: three seconds in
    five bursts is not a sustained vowel, and a passage read in fragments
    shorter than this was not read. */
export const MIN_VOICED_SECONDS = 1.5;
/** Coefficient of variation of F0 across the voiced frames. Asked only of
    the sustained vowel - a read passage moves in pitch by design, which is
    why `PASSAGE_CHECKS` leaves this out rather than relaxing the number. */
export const MAX_F0_CV = 0.08;

/** Digital silence has no floor to divide by, so the reported SNR stops
    here rather than running to Infinity. */
const MAX_SNR_DB = 60;

/** How much unvoiced audio it takes before it counts as a measurement of the
    room: 100 ms at the tracker's frame. Below that the only unvoiced frames
    are the two or three straddling the moment the voice started, which carry
    half a voice each and would be read as a very loud room - the browser
    tier caught exactly that, reporting a clean synthesized take as noisy
    because its file began three frames before the tone did. */
const MIN_ROOM_FRAMES = 10;

/** The quiet quarter of the room's frames. A percentile rather than the
    median for the same reason: what is wanted is the room, and the loud end
    of the unvoiced frames is usually breath, a chair, or the edge of a word. */
const ROOM_PERCENTILE = 0.25;

export type QualityCheck = 'clipping' | 'noise' | 'tooShort' | 'unsteady';

/** The passage is read aloud, so its pitch moves. Everything else applies. */
export const PASSAGE_CHECKS: readonly QualityCheck[] = ['clipping', 'noise', 'tooShort'];
/** The vowel is held, so all four apply. */
export const VOWEL_CHECKS: readonly QualityCheck[] = ['clipping', 'noise', 'tooShort', 'unsteady'];

/** What the gate decides on: the measurements, without the verdict. */
export interface QualitySignals {
  /** Largest absolute sample in the take. */
  peak: number;
  /** Voiced level against the room floor. */
  snrDb: number;
  voicedSeconds: number;
  longestVoicedSeconds: number;
  /** null when nothing was voiced, which is not the same as steady. */
  f0Cv: number | null;
}

export interface QualityReport extends QualitySignals {
  /** Every check that failed, in the order they are listed - all of them,
      not the first, because a take can be both too loud and too short and
      fixing one of those alone is a wasted retake. */
  failed: QualityCheck[];
  passed: boolean;
}

/* **Why the frame levels are a histogram and not a list.**

   Two of the numbers below are ranks rather than sums: the median level of
   the voiced frames and the quiet quarter of the room's. A rank cannot be
   kept as a running total the way a peak or a mean can - it needs to know
   about every value that came before it - and keeping the values themselves
   is what made the live gauge's poll grow with the take.

   So the levels go into a fixed histogram of dBFS bins, which is the
   constant-space version of the sorted list, and every rank is read off it.
   dB bins rather than linear ones because the answer is a ratio in dB, so
   the quantisation is even where the threshold is.

   **What it costs, stated properly.** Two things could move the answer: the
   bin a level lands in, and which values the rank picks. The second one is
   not paid - `rankDb` selects and interpolates exactly as
   `percentileOfSorted` does over a sorted list, so a nearest-rank shortcut
   does not add error on top of the bins. That leaves the bins: each rank is
   off by at most half a bin, and the SNR is a difference of two of them, so
   at 0.01 dB a bin the reported figure is within 0.01 dB of what the sorted
   lists answered.

   That is not zero, and at a hard threshold nothing lossy can be. A take
   whose true SNR sits within 0.01 dB of the 15 dB the gate asks for can come
   out the other side of it. Against a figure that moves by whole decibels
   between two takes of the same voice in the same room, a hundredth of one
   is not a verdict anybody can hold the gate to - but it is the honest
   bound, and it is what the pinned test in quality.test.ts measures.

   A fixed-size random reservoir was the other option and was not taken: it
   would make the same take read differently on two runs, and this number is
   compared against a threshold and then written into a stored benchmark. */
const LEVEL_FLOOR_DB = -120;
const LEVEL_BIN_DB = 0.01;
const LEVEL_BINS = Math.round(-LEVEL_FLOOR_DB / LEVEL_BIN_DB) + 1;

const dbOfBin = (bin: number) => LEVEL_FLOOR_DB + bin * LEVEL_BIN_DB;

interface Levels {
  add(level: number): void;
  readonly count: number;
  /** The level at `fraction` of the way up, in dBFS, interpolated between
      the two ranks it falls between exactly as `percentileOfSorted` does.
      `LEVEL_FLOOR_DB` means it landed in the underflow bin, which is digital
      silence as far as any microphone is concerned. */
  rankDb(fraction: number): number;
}

function makeLevels(): Levels {
  const bins = new Int32Array(LEVEL_BINS);
  let count = 0;
  return {
    add(level) {
      // A level of zero takes the log to -Infinity, which clamps into the
      // underflow bin - which is where it belongs.
      const bin = Math.round((20 * Math.log10(level) - LEVEL_FLOOR_DB) / LEVEL_BIN_DB);
      bins[Math.min(LEVEL_BINS - 1, Math.max(0, bin))]++;
      count++;
    },
    get count() {
      return count;
    },
    rankDb(fraction) {
      const at = fraction * (count - 1);
      const below = Math.floor(at);
      // The rank above, except at the very top of the list, where the two
      // ranks are the same one and the interpolation weighs nothing.
      const above = Math.min(below + 1, count - 1);

      let seen = 0;
      let lower = -1;
      for (let bin = 0; bin < LEVEL_BINS; bin++) {
        seen += bins[bin];
        if (lower < 0 && seen > below) lower = bin;
        if (seen > above) return dbOfBin(lower) + (dbOfBin(bin) - dbOfBin(lower)) * (at - below);
      }
      return dbOfBin(LEVEL_BINS - 1);
    }
  };
}

/** The gate's measurements, kept as each frame completes rather than
    recomputed from the take. `observeSamples` is the peak's, `observeFrame`
    is everything else's - a frame's level over one hop, and the F0 the
    tracker gave it, with null meaning room. */
export interface RunningQualitySignals {
  observeSamples(chunk: Float32Array): void;
  observeFrame(level: number, hz: number | null): void;
  signals(): QualitySignals;
}

export function runningQualitySignals(hopSeconds: number): RunningQualitySignals {
  let peak = 0;
  const voicedLevels = makeLevels();
  const roomLevels = makeLevels();

  let voicedFrames = 0;
  let longestRun = 0;
  let run = 0;

  // Welford, so the coefficient of variation survives being a running one:
  // the two-pass mean-then-variance it replaces cannot be done in a single
  // sweep, and summing the squares instead loses its leading digits at the
  // 8% spread the steadiness check actually turns on.
  let mean = 0;
  let sumSquaredDeviation = 0;

  return {
    observeSamples(chunk) {
      for (const sample of chunk) peak = Math.max(peak, Math.abs(sample));
    },

    observeFrame(level, hz) {
      if (hz === null) {
        roomLevels.add(level);
        run = 0;
        return;
      }
      voicedLevels.add(level);
      voicedFrames++;
      run++;
      longestRun = Math.max(longestRun, run);

      const delta = hz - mean;
      mean += delta / voicedFrames;
      sumSquaredDeviation += delta * (hz - mean);
    },

    signals() {
      return {
        peak,
        snrDb: signalToNoiseDb(voicedLevels, roomLevels),
        voicedSeconds: voicedFrames * hopSeconds,
        longestVoicedSeconds: longestRun * hopSeconds,
        // A take with no pitch in it is caught by the length check, and
        // calling it steady would be the gate laundering it through.
        f0Cv:
          voicedFrames === 0 || mean === 0
            ? null
            : Math.sqrt(sumSquaredDeviation / voicedFrames) / mean
      };
    }
  };
}

/** Voice against room: the median level of the frames the pitch track called
    voiced, over the quiet quarter of the frames it did not.

    Splitting on the track rather than on a loudness percentile is what makes
    this a measurement of the room instead of a measurement of the quiet part
    of a sentence: a held vowel has no quiet part, so a percentile floor would
    divide the voice by itself and report every clean sustained take as noisy.

    Both ranks come back in dB already, so the ratio is their difference and
    no logarithm is taken here at all.

    Two ends of the scale, both stated rather than left implicit. A take with
    no voiced frame has no signal to measure and scores zero, which the length
    check is failing it for anyway. A take with too little unvoiced audio to
    call a room has none to measure, and it got that way by being periodic
    from end to end - which is what a clean take with the microphone already
    running sounds like - so it scores the ceiling. A room down in the
    underflow bin scores the ceiling for the same reason: there is nothing
    there to divide by. */
function signalToNoiseDb(voicedLevels: Levels, roomLevels: Levels): number {
  if (voicedLevels.count === 0) return 0;
  if (roomLevels.count < MIN_ROOM_FRAMES) return MAX_SNR_DB;
  const floorDb = roomLevels.rankDb(ROOM_PERCENTILE);
  if (floorDb <= LEVEL_FLOOR_DB) return MAX_SNR_DB;
  return Math.min(MAX_SNR_DB, voicedLevels.rankDb(0.5) - floorDb);
}

/** The same measurements over a take that is already whole - the decoded
    file, which is what a stored benchmark is judged on. The frames come from
    the tracker; this only has to say how loud each one was.

    `track` has to be `trackPitch`'s own output at this rate, because the hop
    a frame's level is measured over is read from the geometry rather than
    from the spacing of the frames handed in. A thinned or resampled track
    would be measured against the wrong span - `track.ts`'s downsampled one
    is for drawing, and never comes here. */
export function takeSignals(
  samples: Float32Array,
  sampleRate: number,
  track: PitchTrack
): QualitySignals {
  const { hop, hopSeconds } = frameGeometry(sampleRate);
  const running = runningQualitySignals(hopSeconds);
  running.observeSamples(samples);
  for (const frame of track.frames) {
    const from = Math.round(frame.atSeconds * sampleRate);
    const length = Math.min(hop, samples.length - from);
    if (length <= 0) break;
    running.observeFrame(rms(samples, from, length), frame.hz);
  }
  return running.signals();
}

export function assessQuality(
  signals: QualitySignals,
  checks: readonly QualityCheck[]
): QualityReport {
  const failing: Record<QualityCheck, boolean> = {
    clipping: signals.peak >= PEAK_CEILING,
    noise: signals.snrDb < MIN_SNR_DB,
    tooShort: signals.longestVoicedSeconds < MIN_VOICED_SECONDS,
    // A take with no pitch at all fails the length check, so steadiness has
    // nothing to add to it and stays quiet rather than piling on.
    unsteady: signals.f0Cv !== null && signals.f0Cv > MAX_F0_CV
  };

  const failed = checks.filter((check) => failing[check]);
  return { ...signals, failed, passed: failed.length === 0 };
}
