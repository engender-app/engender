/* Fundamental frequency over a take, by YIN (phase 5 deepening ticket 15,
   CONTEXT: "Voice benchmark").

   Pure arithmetic over a buffer of samples: no clock, no database, nothing
   from $lib/paraglide (ADR-0016), so the Node tier can prove it against
   synthesized input with no browser anywhere near it. The browser half -
   turning a recorded file into these samples - lives in
   stores/voiceBenchmark.ts and does nothing this module could be asked to do.

   What it reports and what it deliberately does not: a median, a percentile
   span, a spread in semitones, a note name. No comparison to a range, no
   label, no direction of travel (PRODUCT.md:109). The number is the answer.

   **Why the span is percentiles and not a filter.** The tenth and ninetieth
   percentiles of the voiced frames are the reported span, and the frames
   outside them are still in the median. Vocal fry at the end of a sentence,
   a cough, a chair creak and the octave-down flip a tired voice makes are
   all real parts of a real take, and every one of them would move a plain
   min/max by an octave. The next reader will want to add a hand-tuned
   plausibility filter in front of this - a Hz floor, an "ignore frames more
   than N semitones from the median" pass. That filter is what the percentiles
   already are, done without a threshold somebody has to defend, and a second
   one on top would only hide the takes where the fry is the interesting part.

   Sample rate: the analysis is written for 16 kHz, which is what the browser
   half decodes to (formants of interest sit under 4 kHz, and YIN's cost is
   quadratic in the search range). Nothing here assumes it - every bound is
   derived from the rate passed in. */

/** The pitch range searched. Wider than any one voice on purpose: the
    engine has no business deciding in advance which end of it a person's
    voice belongs at. */
const MIN_F0_HZ = 60;
const MAX_F0_HZ = 500;

/** 10 ms between frame starts, the usual pitch-tracking hop. Also the unit
    every duration this module reports is counted in, so a voiced stretch is
    accurate to a hundredth of a second. */
const HOP_SECONDS = 0.01;

/** YIN's absolute threshold. A frame is voiced when its cumulative mean
    normalized difference dips below this at some lag: 0.15 is the value the
    YIN paper settles on, and it is what separates a periodic frame from
    noise or a room. */
const APERIODICITY_THRESHOLD = 0.15;

/** Below this RMS a frame is a room rather than a voice, and its difference
    function would be all zeroes - which normalizes to 0/0 rather than to
    "very periodic". */
const SILENCE_RMS = 1e-4;

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export interface PitchFrame {
  /** Seconds from the start of the buffer to the frame's first sample. */
  atSeconds: number;
  /** null where the frame was not voiced. */
  hz: number | null;
}

export interface PitchStats {
  medianHz: number;
  /** The 10th and 90th percentile of the voiced frames - see the header. */
  p10Hz: number;
  p90Hz: number;
  /** Spread of the voiced frames in semitones around the median. */
  semitoneSd: number;
  /** The note the median lands nearest, as "A3". */
  note: string;
}

export interface PitchTrack {
  frames: readonly PitchFrame[];
  /** Total voiced time, pauses excluded. */
  voicedSeconds: number;
  /** The longest unbroken voiced stretch - what a sustained vowel is
      measured by, since three seconds in six half-second bursts is not a
      sustained vowel. */
  longestVoicedSeconds: number;
  /** First voiced frame to last, pauses included. The denominator of a
      speaking rate: the pauses between words are part of how fast somebody
      read a passage. */
  spokenSeconds: number;
  /** null when nothing in the buffer was voiced. */
  stats: PitchStats | null;
}

/** The note nearest a frequency, in equal temperament from A4 = 440 Hz.
    Sharps only: this is a readout, not a score anybody transposes. */
export function noteName(hz: number): string {
  const midi = Math.round(69 + 12 * Math.log2(hz / 440));
  return `${NOTE_NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
}

/** Words over minutes. Null rather than Infinity when no time passed: a
    passage with no measurable spoken span has no rate, and a benchmark
    stores that as an absent number rather than a made-up one. */
export function wordsPerMinute(wordCount: number, spokenSeconds: number): number | null {
  if (spokenSeconds <= 0) return null;
  return (wordCount / spokenSeconds) * 60;
}

function rms(samples: Float32Array, from: number, length: number): number {
  let sum = 0;
  for (let i = from; i < from + length; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / length);
}

/** One frame's F0, or null if it was not voiced.

    The three YIN steps, in order: the squared difference function over the
    lag range, its cumulative mean normalization (which is what makes one
    fixed threshold work across loudness), and parabolic interpolation around
    the chosen lag, which is where the sub-sample accuracy the +/-1 Hz
    criterion needs comes from. */
function frameF0(
  samples: Float32Array,
  from: number,
  windowLength: number,
  minTau: number,
  maxTau: number,
  sampleRate: number
): number | null {
  if (rms(samples, from, windowLength + maxTau) < SILENCE_RMS) return null;

  const difference = new Float64Array(maxTau + 1);
  for (let tau = minTau; tau <= maxTau; tau++) {
    let sum = 0;
    for (let i = 0; i < windowLength; i++) {
      const delta = samples[from + i] - samples[from + i + tau];
      sum += delta * delta;
    }
    difference[tau] = sum;
  }

  const normalized = new Float64Array(maxTau + 1);
  let running = 0;
  for (let tau = minTau; tau <= maxTau; tau++) {
    running += difference[tau];
    normalized[tau] = running === 0 ? 1 : (difference[tau] * (tau - minTau + 1)) / running;
  }

  // The first dip below the threshold that is also a local minimum, not the
  // global minimum: the global one is often a multiple of the true period.
  let chosen = -1;
  for (let tau = minTau + 1; tau < maxTau; tau++) {
    if (normalized[tau] < APERIODICITY_THRESHOLD) {
      while (tau + 1 < maxTau && normalized[tau + 1] < normalized[tau]) tau++;
      chosen = tau;
      break;
    }
  }
  if (chosen < 0) return null;

  const previous = normalized[chosen - 1];
  const next = normalized[chosen + 1];
  const denominator = 2 * (2 * normalized[chosen] - next - previous);
  const refined = denominator === 0 ? chosen : chosen + (next - previous) / denominator;

  const hz = sampleRate / refined;
  return hz >= MIN_F0_HZ && hz <= MAX_F0_HZ ? hz : null;
}

function percentile(sorted: number[], fraction: number): number {
  if (sorted.length === 1) return sorted[0];
  const at = fraction * (sorted.length - 1);
  const below = Math.floor(at);
  const above = Math.min(below + 1, sorted.length - 1);
  return sorted[below] + (sorted[above] - sorted[below]) * (at - below);
}

export function trackPitch(samples: Float32Array, sampleRate: number): PitchTrack {
  const maxTau = Math.floor(sampleRate / MIN_F0_HZ);
  const minTau = Math.max(2, Math.floor(sampleRate / MAX_F0_HZ));
  // The window YIN compares is one full lowest-pitch period, and it needs
  // another maxTau samples after it to shift against.
  const windowLength = maxTau;
  const hop = Math.max(1, Math.round(sampleRate * HOP_SECONDS));
  const hopSeconds = hop / sampleRate;

  const frames: PitchFrame[] = [];
  for (let from = 0; from + windowLength + maxTau <= samples.length; from += hop) {
    frames.push({
      atSeconds: from / sampleRate,
      hz: frameF0(samples, from, windowLength, minTau, maxTau, sampleRate)
    });
  }

  const voiced = frames.filter((frame) => frame.hz !== null).map((frame) => frame.hz as number);

  let longestRun = 0;
  let run = 0;
  let firstVoiced = -1;
  let lastVoiced = -1;
  for (let i = 0; i < frames.length; i++) {
    if (frames[i].hz === null) {
      run = 0;
      continue;
    }
    run++;
    longestRun = Math.max(longestRun, run);
    if (firstVoiced < 0) firstVoiced = i;
    lastVoiced = i;
  }

  const track: PitchTrack = {
    frames,
    voicedSeconds: voiced.length * hopSeconds,
    longestVoicedSeconds: longestRun * hopSeconds,
    spokenSeconds: firstVoiced < 0 ? 0 : (lastVoiced - firstVoiced + 1) * hopSeconds,
    stats: null
  };
  if (voiced.length === 0) return track;

  const sorted = [...voiced].sort((a, b) => a - b);
  const medianHz = percentile(sorted, 0.5);
  let squared = 0;
  for (const hz of voiced) {
    const semitones = 12 * Math.log2(hz / medianHz);
    squared += semitones * semitones;
  }

  return {
    ...track,
    stats: {
      medianHz,
      p10Hz: percentile(sorted, 0.1),
      p90Hz: percentile(sorted, 0.9),
      semitoneSd: Math.sqrt(squared / voiced.length),
      note: noteName(medianHz)
    }
  };
}
