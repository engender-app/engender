/* Assess recording conditions before storing a voice benchmark.
   Use the supplied pitch track and report which condition to change,
   such as microphone distance. The checks apply to the recording only.

   assessQuality applies thresholds to QualitySignals. takeSignals
   and the live gauge feed the same frame accumulator so the displayed
   progress and final verdict use identical measurements. */

import { passageLanguage, type BandLanguage } from './bands';
import { frameGeometry, rms, type PitchTrack } from './pitch';

/** Full scale is 1.0, so a peak this close to it means samples were very
    likely already flattened against the rails by the time they arrived. */
export const PEAK_CEILING = 0.98;
/** Voice against room, in dB. Below this the formant estimate starts
    describing the room. */
const MIN_SNR_DB = 15;
/** Continuous voicing, in seconds. Continuous, not total: three seconds in
    five bursts is not a sustained vowel. Asked only of the held vowel - the
    sentence that used to follow, that "a passage read in fragments shorter
    than this was not read", was the mistake redesign ticket 41 fixed. A
    read passage is fragments by nature: every voiceless stop and fricative
    breaks voicing, so an honest read's longest unbroken run is a few
    hundred milliseconds and could never clear this. What the passage
    answers to instead is `readingFloorSeconds`. */
const MIN_VOICED_SECONDS = 1.5;
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

export type QualityCheck = 'clipping' | 'noise' | 'tooShort' | 'underRead' | 'unsteady';

/** The passage is read aloud, so its pitch moves and steadiness is not asked
    of it, and its length is how much voice it carried rather than how long
    one stretch of it ran (`underRead`). */
const PASSAGE_CHECKS: readonly QualityCheck[] = ['clipping', 'noise', 'underRead'];
/** The vowel is held, so all four of its checks apply. */
const VOWEL_CHECKS: readonly QualityCheck[] = ['clipping', 'noise', 'tooShort', 'unsteady'];
/** Free speech with no passage behind it, which is the practise tab. The
    recording checks and nothing else: a short stretch of speech is a short
    stretch of speech, not a take that came up short. */
const SPEECH_CHECKS: readonly QualityCheck[] = ['clipping', 'noise'];

/**
 * Multiply the passage word count by seconds of voiced audio per
 * word. Measure speech instead of elapsed time so pauses do not
 * inflate coverage.
 *
 * The values are 70% of a brisk espeak-ng read measured through
 * trackPitch and takeSignals. This margin needs checking against
 * human recordings. Polish and English use separate values because
 * their bundled passages differ in syllables per word. Unmeasured
 * languages use English, and custom passages use the app locale
 * as their fallback.
 */
const VOICED_SECONDS_PER_WORD: Record<BandLanguage, number> = { en: 0.083, pl: 0.112 };

/** How much voiced audio a passage of `wordCount` words has to carry before
    the app will say it was read. */
export function readingFloorSeconds(wordCount: number, language: BandLanguage): number {
  return wordCount * (VOICED_SECONDS_PER_WORD[language] ?? VOICED_SECONDS_PER_WORD.en);
}

/** What a take is being judged as: the checks its task calls for, and the
    floor `underRead` measures against.

    One value rather than two arguments, because the live gauge and the
    stored verdict both take it and the module's whole contract is that
    those two cannot disagree (see the header). Two arguments are two
    chances to pass a different pair. */
export interface QualityGate {
  checks: readonly QualityCheck[];
  /** Seconds of voiced audio. Zero on a task with no passage behind it,
      where `underRead` is not among the checks and nothing reads it. */
  readingFloorSeconds: number;
}

export const VOWEL_GATE: QualityGate = { checks: VOWEL_CHECKS, readingFloorSeconds: 0 };
export const SPEECH_GATE: QualityGate = { checks: SPEECH_CHECKS, readingFloorSeconds: 0 };

/** The gate a read of this passage answers to. `wordCount` is the passage's
    own, so a person's own passage takes the identical rule - the floor reads
    how many words there are and never which text they are. */
export function passageGate(wordCount: number, language: BandLanguage): QualityGate {
  return { checks: PASSAGE_CHECKS, readingFloorSeconds: readingFloorSeconds(wordCount, language) };
}

/** **The rate a stored benchmark cannot honestly have been read at.**

    Until redesign ticket 41 the passage had no working length gate, so a
    take abandoned a few words in was stored with the whole passage's word
    count over the seconds it actually ran: roughly double the true speaking
    rate, and no stored field proves it (no benchmark records how much of the
    passage was read). What is left is the number itself, and twice an
    unhurried read is the signature of the bug rather than of a fast reader.

    Each is about 1.3 times the fastest read its language was measured at,
    which is high enough that no honest read reaches it and low enough to
    catch a half-read of the same passage at the slowest pace measured -
    the one case the length floor above deliberately lets through: half a
    passage read slowly carries as much voice as the whole read fast, and
    voiced time alone cannot tell them apart. */
const MAX_PLAUSIBLE_WPM: Record<BandLanguage, number> = { en: 300, pl: 200 };

/** Whether a stored speaking rate is one a person could have read at.

    Takes the passage key rather than a language because the caller is a
    stored row and the row carries the key. A custom passage names no
    language, and rather than guess one it gets the most permissive
    threshold there is: suppressing an honest figure is the worse mistake of
    the two. */
export function plausibleRate(wordsPerMinute: number, passageKey: string): boolean {
  const language = passageLanguage(passageKey);
  const ceiling =
    language === null ? Math.max(...Object.values(MAX_PLAUSIBLE_WPM)) : MAX_PLAUSIBLE_WPM[language];
  return wordsPerMinute <= ceiling;
}

/** What the gate decides on: the measurements, without the verdict. */
interface QualitySignals {
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

/* Keep voiced median and room quartile in a constant-space
   histogram of dBFS bins. rankDb selects and interpolates ranks like
   percentileOfSorted, so the only loss is half a bin per rank.

   At 0.01 dB per bin, the SNR difference is within 0.01 dB of the
   sorted-list result. A take that close to the 15 dB gate can cross
   the threshold. A random reservoir would make repeated measurements
   vary, which would change a stored benchmark. */
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
interface RunningQualitySignals {
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

/**
 * Subtract the quiet quartile of unvoiced frames from the median
 * dB level of voiced frames. Use the pitch track to split the sets so
 * a clean held vowel is never compared with itself as room noise.
 *
 * No voiced signal scores zero. Too few unvoiced frames or noise
 * below the histogram floor scores the ceiling.
 */
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

export function assessQuality(signals: QualitySignals, gate: QualityGate): QualityReport {
  const failing: Record<QualityCheck, boolean> = {
    clipping: signals.peak >= PEAK_CEILING,
    noise: signals.snrDb < MIN_SNR_DB,
    // The held note, measured on one unbroken stretch, and the read passage,
    // measured on how much voice it carried altogether. Two checks rather
    // than one constant read twice, so the name says which task it belongs
    // to and neither task can be judged by the other's shape.
    tooShort: signals.longestVoicedSeconds < MIN_VOICED_SECONDS,
    underRead: signals.voicedSeconds < gate.readingFloorSeconds,
    // A take with no pitch at all fails the length check, so steadiness has
    // nothing to add to it and stays quiet rather than piling on.
    unsteady: signals.f0Cv !== null && signals.f0Cv > MAX_F0_CV
  };

  const failed = gate.checks.filter((check) => failing[check]);
  return { ...signals, failed, passed: failed.length === 0 };
}
