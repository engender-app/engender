/* Vocal tract resonance by linear predictive coding (phase 5 deepening
   ticket 15, CONTEXT: "Voice benchmark").

   F1 and F2: the first two resonances of the tube between the vocal folds
   and the lips. F1 moves with how open the jaw and throat are, F2 with where
   the tongue sits and how the lips are shaped. Both are stated in Hz and
   nothing here reads anything into them (PRODUCT.md:109, and ADR-0059
   deliberately did not narrow that rule here: F1/F2 norms are much shakier
   than F0 norms and move with vowel, height and room, so a narrowed search
   window is how an analyser starts refusing to find the formants somebody
   actually has) - they are a
   measurement of a sustained vowel, not a verdict on a voice.

   Pure, like pitch.ts: a buffer in, two numbers or nothing out.

   **The pitch track is a parameter, not something this recomputes.** A
   formant estimate is only meaningful on a frame that was voiced, and the
   caller already has the track from pitch.ts. Recomputing YIN here would
   double the most expensive part of the analysis to learn something already
   known.

   **The LPC order.** Two poles model one resonance, an adult vocal tract has
   roughly one formant per kilohertz of bandwidth, and two more poles are
   wanted for the glottal source's spectral tilt and the lip radiation. So
   `2 + sampleRate/1000`, which is 18 at the 16 kHz the browser half decodes
   to. This is the parameter that decides whether formants come out at all:
   too low merges F1 and F2 into one broad peak, too high splits a single
   formant into a pair of spurious ones and starts fitting individual
   harmonics of a high voice. It is derived from the rate rather than written
   down as 18, because a buffer at another rate would otherwise silently get
   the wrong model. */

import type { PitchTrack } from './pitch';
import { median } from './series';

/** 25 ms per frame: long enough for the autocorrelation to see several
    periods of a low voice, short enough that a vowel does not drift inside
    one. */
const FRAME_SECONDS = 0.025;

/** Compensates the roughly -6 dB per octave tilt of the glottal source, so
    the higher formants are not buried under the fundamental. The standard
    coefficient. */
const PRE_EMPHASIS = 0.97;

/** Where each formant is looked for. Wide enough to cover any adult vocal
    tract - deliberately not narrowed per voice, since narrowing is how an
    analyzer starts telling people what their formants ought to be. */
const F1_RANGE_HZ = [180, 1100] as const;
const F2_CEILING_HZ = 3200;
/** Two peaks closer than this are one formant the envelope split in two. */
const MIN_FORMANT_GAP_HZ = 150;

/** The envelope is sampled every 5 Hz, which is finer than the accuracy the
    method itself has and so never the limiting factor. */
const ENVELOPE_STEP_HZ = 5;

/** Below this many frames with a usable pair, the median would be one or two
    frames' luck rather than a measurement. */
const MIN_USABLE_FRAMES = 5;

export interface Formants {
  f1Hz: number;
  f2Hz: number;
}

/** Levinson-Durbin: the autocorrelation coefficients to the predictor,
    written into the caller's `a`. False when the recursion goes singular,
    which is a frame with no structure to predict rather than an error to
    raise.

    `a` and `previous` are the caller's buffers, both sized `order + 1` and
    reused frame to frame. Every index of `a` is written before this returns
    true (each is set when the outer loop reaches it, and again by every
    later iteration's inner loop), so a previous frame's values never leak
    into a read; `previous` only ever holds a copy of `a` taken earlier in
    the same call. */
function levinsonDurbin(
  autocorrelation: Float64Array,
  order: number,
  a: Float64Array,
  previous: Float64Array
): boolean {
  let error = autocorrelation[0];
  if (error <= 0) return false;
  a[0] = 1;

  for (let i = 1; i <= order; i++) {
    let acc = autocorrelation[i];
    for (let j = 1; j < i; j++) acc -= a[j] * autocorrelation[i - j];
    const reflection = acc / error;
    if (!Number.isFinite(reflection)) return false;

    previous.set(a);
    a[i] = reflection;
    for (let j = 1; j < i; j++) a[j] = previous[j] - reflection * previous[i - j];

    error *= 1 - reflection * reflection;
    if (error <= 0) return false;
  }
  return true;
}

/** The first two peaks of the LPC spectral envelope inside the formant
    ranges.

    Peak picking rather than solving for the polynomial's complex roots: the
    peaks of |1/A(f)| are what the roots would be reported as anyway, the
    grid is finer than the method's own accuracy, and a root finder is a
    hundred lines of numerics whose failure mode is silent.

    `cosTable`/`sinTable` hold cos(omega*k)/sin(omega*k) for every (frequency
    bin, order step) pair the envelope grid uses - the same values on every
    frame, since they depend only on the fixed grid and order, never on this
    frame's `a`. The caller builds them once per take instead of this
    recomputing roughly order*count trig calls per frame. `magnitude` is the
    caller's scratch buffer, sized `count` and fully overwritten below before
    it is read. */
function peakFormants(
  a: Float64Array,
  order: number,
  count: number,
  fromHz: number,
  cosTable: Float64Array,
  sinTable: Float64Array,
  magnitude: Float64Array
): Formants | null {
  for (let i = 0; i < count; i++) {
    const base = i * (order + 1);
    let real = 1;
    let imaginary = 0;
    for (let k = 1; k <= order; k++) {
      real -= a[k] * cosTable[base + k];
      imaginary += a[k] * sinTable[base + k];
    }
    magnitude[i] = 1 / Math.sqrt(real * real + imaginary * imaginary);
  }

  const peaks: number[] = [];
  for (let i = 1; i < count - 1; i++) {
    if (magnitude[i] > magnitude[i - 1] && magnitude[i] >= magnitude[i + 1]) {
      peaks.push(fromHz + i * ENVELOPE_STEP_HZ);
    }
  }

  const f1 = peaks.find((hz) => hz >= F1_RANGE_HZ[0] && hz <= F1_RANGE_HZ[1]);
  if (f1 === undefined) return null;
  const f2 = peaks.find((hz) => hz >= f1 + MIN_FORMANT_GAP_HZ && hz <= F2_CEILING_HZ);
  if (f2 === undefined) return null;
  return { f1Hz: f1, f2Hz: f2 };
}

/** F1 and F2 for a sustained vowel, as the median of the voiced frames'
    estimates. Null when the take holds no vowel to measure: silence, room
    noise, or too few frames that yielded a plausible pair. A benchmark
    stores that as no resonance rather than as a failure - the passage is
    still a benchmark without it (ticket 15's storage seam). */
export function analyseFormants(
  samples: Float32Array,
  sampleRate: number,
  track: PitchTrack
): Formants | null {
  const frameLength = Math.round(sampleRate * FRAME_SECONDS);
  const order = 2 + Math.round(sampleRate / 1000);
  if (samples.length < frameLength) return null;

  // The Hamming taper depends only on frameLength, fixed for the whole take.
  const taper = new Float64Array(frameLength);
  for (let i = 0; i < frameLength; i++) {
    taper[i] = 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (frameLength - 1));
  }

  // The envelope grid and its trig tables likewise depend only on order and
  // sampleRate, both fixed for the whole take - see peakFormants's header.
  const ceilingHz = Math.min(F2_CEILING_HZ + 400, sampleRate / 2 - 100);
  const gridFromHz = F1_RANGE_HZ[0] - 100;
  const gridCount = Math.floor((ceilingHz - gridFromHz) / ENVELOPE_STEP_HZ) + 1;
  const cosTable = new Float64Array(gridCount * (order + 1));
  const sinTable = new Float64Array(gridCount * (order + 1));
  for (let i = 0; i < gridCount; i++) {
    const omega = (2 * Math.PI * (gridFromHz + i * ENVELOPE_STEP_HZ)) / sampleRate;
    const base = i * (order + 1);
    for (let k = 1; k <= order; k++) {
      cosTable[base + k] = Math.cos(omega * k);
      sinTable[base + k] = Math.sin(omega * k);
    }
  }

  const windowed = new Float64Array(frameLength);
  const autocorrelation = new Float64Array(order + 1);
  const a = new Float64Array(order + 1);
  const previous = new Float64Array(order + 1);
  const magnitude = new Float64Array(gridCount);

  const f1s: number[] = [];
  const f2s: number[] = [];

  for (const frame of track.frames) {
    if (frame.hz === null) continue;
    const from = Math.round(frame.atSeconds * sampleRate);
    if (from + frameLength > samples.length) break;

    // Pre-emphasis and the Hamming window, in one pass over the frame.
    for (let i = 0; i < frameLength; i++) {
      const previousSample = from + i === 0 ? 0 : samples[from + i - 1];
      windowed[i] = (samples[from + i] - PRE_EMPHASIS * previousSample) * taper[i];
    }

    for (let lag = 0; lag <= order; lag++) {
      let sum = 0;
      for (let i = lag; i < frameLength; i++) sum += windowed[i] * windowed[i - lag];
      autocorrelation[lag] = sum;
    }
    // A hair of white noise on the diagonal, the usual conditioning: it costs
    // nothing on a real frame and keeps the recursion off a singular matrix.
    autocorrelation[0] *= 1.0001;

    if (!levinsonDurbin(autocorrelation, order, a, previous)) continue;
    const formants = peakFormants(a, order, gridCount, gridFromHz, cosTable, sinTable, magnitude);
    if (!formants) continue;
    f1s.push(formants.f1Hz);
    f2s.push(formants.f2Hz);
  }

  if (f1s.length < MIN_USABLE_FRAMES) return null;
  return { f1Hz: median(f1s), f2Hz: median(f2s) };
}
