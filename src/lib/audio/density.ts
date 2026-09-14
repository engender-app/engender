/* Where a voice spent its time, as a shape (redesign ticket 42).

   The take already reports three percentiles of one distribution - the
   median, and the p10-p90 span - and until this existed that distribution
   was never drawn. A person was handed three abstractions off a shape they
   had never seen, and the shape is the thing they came for: "most of the
   read sat here, with a tail down to there" is one look, where three
   numbers are three lookups.

   It is the same decoded track the trace is drawn from, on the same log2-Hz
   axis (bands.ts). Nothing new is stored and nothing is decoded twice -
   benchmark.ts's note about a second caller downsampling its own copy
   applies here as much as it did there.

   **A smoothed shape rather than a histogram.** A stored track is four
   points a second, so a five-second read is twenty numbers: binned raw,
   twenty numbers over an axis this tall is a comb, and the comb's teeth
   would be read as structure in a voice that has none. The kernel is what
   makes a short read honest, and the bandwidth floor below is what stops it
   inventing detail on a long one.

   **Peak-normalised, not area-normalised.** What the figure draws is the
   shape's own profile against the axis, so the mode fills the width it is
   given whether the read was five seconds or forty. Two takes compared side
   by side are then two proportions of their own reads rather than two
   durations, which is the only comparison between them that means anything
   - a longer read is not a louder claim.

   Pure arithmetic over frames, like the rest of $lib/audio: no clock, no
   database, nothing from paraglide, so the Node tier proves it without a
   browser. Positions on a drawing are the component's; this produces
   frequencies and weights only. */

import type { PitchFrame } from './pitch';
import type { PitchAxis } from './bands';

/** One sample of the shape: a frequency on the axis, and how much of the
    read sat near it, where 1 is the mode. */
export interface DensitySample {
  hz: number;
  /** 0 to 1, the mode at 1. */
  weight: number;
}

/** How many samples the shape is drawn from, evenly spaced in log2 Hz.

    The default axis spans about 27 semitones, so 96 bins is a sample every
    0.28 of a semitone - finer than the kernel can resolve, which is what a
    smooth outline needs, and small enough that the path is a few hundred
    characters rather than a few thousand. */
export const DENSITY_BINS = 96;

/** The narrowest the kernel may get, in semitones.

    Silverman's rule alone hands a forty-second read a bandwidth near 0.9 of
    a semitone and a five-second read one near 1.2, which sounds like the
    short take is already safe - but a read whose frames barely move gets a
    tiny spread and, through the rule, a tiny bandwidth, and twenty such
    frames come out as twenty spikes. The floor is what a phone's own pitch
    tracker can distinguish anyway: YIN's frame-to-frame jitter on a steady
    voice is a few tenths of a semitone, so a mode narrower than one
    semitone is measurement noise drawn as shape. */
const MIN_BANDWIDTH_SEMITONES = 1;

/** Semitones from the axis floor, which is the unit everything below works
    in: the axis is log2 in Hz, so a kernel of fixed width in semitones is
    the same width in pixels wherever on the axis it lands. */
const semitonesUp = (hz: number, axis: PitchAxis): number => 12 * Math.log2(hz / axis.lowHz);

/** Silverman's rule of thumb, floored. Over the sample's own spread, so a
    voice that wandered gets a wider kernel than one that did not. */
function bandwidth(at: readonly number[]): number {
  if (at.length < 2) return MIN_BANDWIDTH_SEMITONES;
  const mean = at.reduce((sum, value) => sum + value, 0) / at.length;
  const variance = at.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (at.length - 1);
  return Math.max(MIN_BANDWIDTH_SEMITONES, 1.06 * Math.sqrt(variance) * at.length ** -0.2);
}

/** The shape of a take's voiced frames across `axis`, oldest-to-newest
    order discarded - this is where the voice was, not when.

    Null where no frame was voiced: a take with nothing in it draws no
    shape, the same way it draws no trace, and an empty outline against the
    cited bands would be a worse claim than the sentence that says the
    frames are gone. */
export function pitchDensity(
  frames: readonly PitchFrame[],
  axis: PitchAxis
): DensitySample[] | null {
  const at = frames
    .map((frame) => frame.hz)
    .filter((hz): hz is number => hz !== null)
    .map((hz) => semitonesUp(hz, axis));
  if (at.length === 0) return null;

  const width = bandwidth(at);
  const span = semitonesUp(axis.highHz, axis);
  const step = span / (DENSITY_BINS - 1);

  const weights: number[] = [];
  for (let bin = 0; bin < DENSITY_BINS; bin++) {
    const here = bin * step;
    let sum = 0;
    for (const frame of at) {
      const z = (here - frame) / width;
      sum += Math.exp(-0.5 * z * z);
    }
    weights.push(sum);
  }

  const peak = Math.max(...weights);
  /* Every frame further from the axis than the kernel reaches - possible
     only where the caller drew an axis its own take does not fit on, which
     `pitchAxis` does not do. Nothing to draw rather than a division by
     zero. */
  if (peak === 0) return null;

  return weights.map((weight, bin) => ({
    hz: axis.lowHz * 2 ** ((bin * step) / 12),
    weight: weight / peak
  }));
}

/** How wide the shape is at one frequency, interpolated between the two
    samples it falls between.

    What the median, p10 and p90 marks need: each is drawn from the spine
    out to the outline, so it ends on the shape rather than crossing it at
    an arbitrary length. Outside the axis it is 0 - there is no shape out
    there to mark. */
export function densityAt(density: readonly DensitySample[], hz: number): number {
  if (density.length === 0) return 0;
  const first = density[0];
  const last = density[density.length - 1];
  if (hz <= first.hz) return first.weight;
  if (hz >= last.hz) return last.weight;

  const span = Math.log2(last.hz / first.hz);
  const at = (Math.log2(hz / first.hz) / span) * (density.length - 1);
  const below = Math.floor(at);
  const above = Math.min(below + 1, density.length - 1);
  return density[below].weight + (density[above].weight - density[below].weight) * (at - below);
}
