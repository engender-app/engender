/* The waveform's bars (ticket 46).

   A recording's scrub track is a waveform because a person looking for the
   moment they said something scans a shape, not a bar. The shape has to be
   the recording's own: a decorative waveform that does not move with the
   audio is worse than a plain bar, because it says something and the thing
   it says is false.

   So a bar is the root-mean-square amplitude of the slice of the recording
   it stands over, normalised to the loudest bar. Normalised, because a
   recording made at arm's length would otherwise draw as a flat line and a
   waveform nobody can read is the same as no waveform; relative heights
   inside one recording are untouched by the scaling, so the shape stays
   this recording's shape. Two recordings are not comparable to each other
   by bar height, which is not a reading anyone takes off a scrub track.

   The samples come from `decodeToMono` (audio/decode.ts) at the peaks rate,
   which is where the cost is - see the measurement in the ticket. */

/** Bars across the track. Enough that a syllable is visible in a 30-second
    memo, few enough that a 2px bar and its gap still fit the narrowest
    player the app draws (about 260px inside the entry editor at 320px). */
export const PEAK_BUCKETS = 64;

/** The sample rate the peaks are decoded at. Nothing here is a measurement
    of the voice - it is the envelope - so it is a quarter of the analysis
    rate the benchmark decodes at, and decoding is what the wait is. */
export const PEAKS_SAMPLE_RATE = 8000;

/**
 * The bars for one recording: `buckets` values in 0..1, loudest at 1.
 */
export function peaksFromSamples(samples: Float32Array, buckets: number): Float32Array {
  const bars = new Float32Array(Math.max(0, buckets));
  if (bars.length === 0 || samples.length === 0) return bars;

  const per = samples.length / bars.length;
  let loudest = 0;
  for (let bar = 0; bar < bars.length; bar++) {
    /* Bucket edges are rounded rather than stepped, so a recording shorter
       than the bar count still spreads what it has across the whole track
       instead of drawing its samples into the first few bars. */
    const from = Math.floor(bar * per);
    const to = Math.max(from + 1, Math.floor((bar + 1) * per));
    let sum = 0;
    let count = 0;
    for (let i = from; i < to && i < samples.length; i++) {
      sum += samples[i] * samples[i];
      count++;
    }
    const rms = count === 0 ? 0 : Math.sqrt(sum / count);
    bars[bar] = rms;
    if (rms > loudest) loudest = rms;
  }

  /* A recording with nothing in it stays flat. Dividing by a near-zero
     loudest would draw the dither of a silent room as a full-height
     waveform. */
  if (loudest <= 1e-6) return new Float32Array(bars.length);
  for (let bar = 0; bar < bars.length; bar++) bars[bar] = Math.min(1, bars[bar] / loudest);
  return bars;
}

/** A bar and the gap after it, in CSS pixels. Two and two: thinner than the
    2px the chart ink rule gives a series (DIRECTION rule 9) would not survive
    a phone, and wider spends a 110px track on eight bars. */
const BAR_PITCH = 4;

/** Bars a track this wide can carry. The floor is what a track squeezed
    below its minimum still draws, so a waveform never collapses into a
    single block. */
export function barCountFor(width: number): number {
  const fits = Math.floor((Number.isFinite(width) ? width : 0) / BAR_PITCH);
  return Math.max(8, Math.min(PEAK_BUCKETS, fits));
}

/**
 * The same waveform at `count` bars: each one the mean of the buckets it
 * covers. Asking for more bars than there are buckets returns the buckets
 * there are - a wide track draws the recording it has rather than an
 * interpolation of it.
 */
export function barsAt(peaks: Float32Array, count: number): Float32Array {
  if (count <= 0 || peaks.length === 0) return new Float32Array(0);
  if (count >= peaks.length) return peaks;

  const bars = new Float32Array(count);
  const per = peaks.length / count;
  for (let bar = 0; bar < count; bar++) {
    const from = Math.floor(bar * per);
    const to = Math.max(from + 1, Math.floor((bar + 1) * per));
    let sum = 0;
    for (let i = from; i < to; i++) sum += peaks[i];
    bars[bar] = sum / (to - from);
  }
  return bars;
}

/* Decoded peaks by file name, for the life of the tab. A row that scrolls
   out and back, a memo played from the browser and then from its entry, and
   twenty rows mounting at once all read one decode.

   Unbounded on purpose: an entry is 64 floats, so a journal with a thousand
   recordings in it holds a quarter of a megabyte here, and the alternative -
   evicting - would decode again on the scroll back up, which is the cost
   this exists to avoid. */
const cached = new Map<string, Float32Array>();
const inFlight = new Map<string, Promise<Float32Array | null>>();

/**
 * The bars for a stored recording, computed once. `key` is the recording's
 * file name; a recording that has no stored file yet (one just recorded in
 * the editor) passes null and is computed without being remembered, since
 * there is no stable name to remember it under.
 */
export async function peaksFor(
  key: string | null,
  read: () => Promise<Float32Array | null>
): Promise<Float32Array | null> {
  if (key === null) return read();

  const held = cached.get(key);
  if (held) return held;

  const running = inFlight.get(key);
  if (running) return running;

  const attempt = read()
    .then((peaks) => {
      if (peaks) cached.set(key, peaks);
      return peaks;
    })
    /* A decode that failed is not an answer, so it is not remembered: the
       file may simply not have been written yet. The next mount tries
       again rather than drawing a permanent flat line. */
    .catch(() => null)
    .finally(() => inFlight.delete(key));

  inFlight.set(key, attempt);
  return attempt;
}

/** Test seam: drops everything remembered. */
export function forgetPeaks(): void {
  cached.clear();
  inFlight.clear();
}
