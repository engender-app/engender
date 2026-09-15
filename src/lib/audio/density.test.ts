/* What the density has to be true about, before it is drawn (redesign
   ticket 42).

   The figure hands somebody three percentiles off a shape they have never
   seen. Once the shape is drawn, the three marks have to land on it where
   the percentiles actually are, and that is arithmetic rather than
   something to check by eye - a kernel wide enough to smooth a five-second
   read is also wide enough to push a mode a semitone off where the frames
   were, and nothing in a rendered figure would say so. */

import { describe, expect, it } from 'vitest';
import type { PitchFrame } from './pitch';
import { DEFAULT_PITCH_AXIS, pitchAxis } from './bands';
import { pitchDensity, densityAt, DENSITY_BINS, type DensitySample } from './density';

/** A take whose voiced frames are drawn from one normal distribution in
    semitones around `centreHz`. Deterministic: a fixed sequence rather than
    Math.random, so a failure is the same failure twice. */
function take(centreHz: number, sdSemitones: number, points: number): PitchFrame[] {
  const frames: PitchFrame[] = [];
  for (let i = 0; i < points; i++) {
    // Box-Muller over a low-discrepancy pair, which fills the distribution
    // evenly at twenty points as well as at two hundred.
    const u = (i + 0.5) / points;
    const v = ((i * 7) % points) / points + 0.5 / points;
    const normal = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    frames.push({ atSeconds: i / 4, hz: centreHz * 2 ** ((normal * sdSemitones) / 12) });
  }
  return frames;
}

/** The voiced frames of a take, ascending, the way the figures were
    computed from it. */
const voiced = (frames: readonly PitchFrame[]): number[] =>
  frames
    .map((f) => f.hz)
    .filter((hz): hz is number => hz !== null)
    .sort((a, b) => a - b);

const percentile = (sorted: readonly number[], fraction: number): number => {
  const at = fraction * (sorted.length - 1);
  const below = Math.floor(at);
  const above = Math.min(below + 1, sorted.length - 1);
  return sorted[below] + (sorted[above] - sorted[below]) * (at - below);
};

/** How much of the shape's area lies below a frequency. Integrated here
    rather than read off the module: what the marks have to answer to is the
    drawn shape, so the check has to start from the samples the figure will
    actually draw. */
function areaBelow(density: readonly DensitySample[], hz: number): number {
  const area = (upTo: number) => {
    let total = 0;
    for (let i = 1; i < density.length; i++) {
      const left = density[i - 1];
      const right = density[i];
      if (left.hz >= upTo) break;
      if (right.hz <= upTo) {
        total += (left.weight + right.weight) / 2;
        continue;
      }
      // The bin the frequency falls inside, in the log2 units the bins are
      // evenly spaced in.
      const part = Math.log2(upTo / left.hz) / Math.log2(right.hz / left.hz);
      total += ((left.weight + densityAt(density, upTo)) / 2) * part;
      break;
    }
    return total;
  };
  return area(hz) / area(Infinity);
}

/** How wide the shape is where it is half its own height, in semitones -
    the ordinary way to state how much a kernel smoothed. Interpolated
    across the crossing bins, so it can report a width finer than the bin
    spacing. */
function halfWidthSemitones(density: readonly DensitySample[]): number {
  const cross = (from: number, to: number): number => {
    const step = from < to ? 1 : -1;
    for (let i = from; i !== to; i += step) {
      const here = density[i].weight;
      const next = density[i + step].weight;
      if (here < 0.5 && next >= 0.5) {
        const part = (0.5 - here) / (next - here);
        const low = density[i].hz;
        const high = density[i + step].hz;
        return 12 * Math.log2(low / density[0].hz) + part * 12 * Math.log2(high / low);
      }
    }
    return NaN;
  };
  const peak = density.reduce((at, sample, i) => (sample.weight > density[at].weight ? i : at), 0);
  return cross(density.length - 1, peak) - cross(0, peak);
}

/** How many times the shape turns over: one for a single mode, two for a
    voice that sat in two places. Spikes are what this counts. */
function modes(weights: readonly number[]): number {
  let count = 0;
  for (let i = 1; i < weights.length - 1; i++) {
    if (weights[i] > weights[i - 1] && weights[i] >= weights[i + 1]) count++;
  }
  return count;
}

describe('the pitch density', () => {
  it('spans the axis it was asked for, at both ends', () => {
    const density = pitchDensity(take(180, 2, 120), DEFAULT_PITCH_AXIS)!;
    expect(density).toHaveLength(DENSITY_BINS);
    expect(density[0].hz).toBeCloseTo(DEFAULT_PITCH_AXIS.lowHz, 6);
    expect(density[density.length - 1].hz).toBeCloseTo(DEFAULT_PITCH_AXIS.highHz, 6);
  });

  it('peaks at 1 and never leaves 0 to 1, so a shape fills its width', () => {
    const density = pitchDensity(take(180, 2, 120), DEFAULT_PITCH_AXIS)!;
    const weights = density.map((sample) => sample.weight);
    expect(Math.max(...weights)).toBeCloseTo(1, 6);
    expect(Math.min(...weights)).toBeGreaterThanOrEqual(0);
  });

  /* The claim the marks make. p10, p50 and p90 are three percentiles of
     this distribution, so a tenth of the shape's area has to lie below the
     p10 mark, half below the median and nine tenths below p90 - otherwise
     the figure draws a mark somewhere the number is not. */
  it('carries a tenth, a half and nine tenths of its area below the three marks', () => {
    const frames = take(178, 2.4, 160);
    const sorted = voiced(frames);
    const axis = pitchAxis({ hz: sorted });
    const density = pitchDensity(frames, axis)!;

    for (const fraction of [0.1, 0.5, 0.9]) {
      expect(areaBelow(density, percentile(sorted, fraction))).toBeCloseTo(fraction, 1);
    }
  });

  it('holds the three marks on a low voice and on a high one alike', () => {
    for (const centreHz of [96, 265]) {
      const frames = take(centreHz, 1.6, 160);
      const sorted = voiced(frames);
      const density = pitchDensity(frames, pitchAxis({ hz: sorted }))!;
      expect(areaBelow(density, percentile(sorted, 0.5))).toBeCloseTo(0.5, 1);
    }
  });

  /* The kernel's own reason for existing. Twenty points is a five-second
     read at the stored track's four points a second, and twenty bumps left
     unsmoothed is the comb this figure must not draw. */
  it('draws one mode for a five-second read, not twenty', () => {
    const density = pitchDensity(take(180, 2, 20), DEFAULT_PITCH_AXIS)!;
    expect(modes(density.map((sample) => sample.weight))).toBe(1);
  });

  /* The floor's own case. A voice that barely moved has almost no spread
     for Silverman's rule to scale by, so the bandwidth it hands back
     collapses and the figure draws a hairline where the person's whole read
     was - detail the phone's own tracker cannot resolve, presented as the
     shape of a voice. Drop MIN_BANDWIDTH_SEMITONES and this is the test
     that goes red. */
  it('never draws a mode narrower than the tracker can resolve', () => {
    const density = pitchDensity(take(180, 0.1, 20), DEFAULT_PITCH_AXIS)!;
    expect(halfWidthSemitones(density)).toBeGreaterThan(2);
  });

  it('draws one mode for a forty-second read too', () => {
    const density = pitchDensity(take(180, 2, 160), DEFAULT_PITCH_AXIS)!;
    expect(modes(density.map((sample) => sample.weight))).toBe(1);
  });

  /* And the limit on the smoothing: a voice that genuinely sat in two
     places is not one wide lump. Six semitones apart is about the distance
     between a habitual pitch and the one somebody is practising towards. */
  it('keeps two modes where the voice really had two', () => {
    const low = take(150, 1, 80);
    const high = take(150 * 2 ** (6 / 12), 1, 80);
    const frames = [...low, ...high].map((frame, at) => ({ ...frame, atSeconds: at / 4 }));
    expect(modes(pitchDensity(frames, DEFAULT_PITCH_AXIS)!.map((s) => s.weight))).toBe(2);
  });

  it('has nothing to draw for a take with no voiced frame', () => {
    expect(pitchDensity([{ atSeconds: 0, hz: null }], DEFAULT_PITCH_AXIS)).toBeNull();
    expect(pitchDensity([], DEFAULT_PITCH_AXIS)).toBeNull();
  });

  /* A hole in the voicing is a frame that was not measured, not a frame at
     the bottom of the axis. */
  it('ignores unvoiced frames rather than counting them anywhere', () => {
    const frames = take(180, 2, 120);
    const withHoles = [...frames, ...frames.map((f) => ({ ...f, hz: null }))];
    const clean = pitchDensity(frames, DEFAULT_PITCH_AXIS)!;
    const holed = pitchDensity(withHoles, DEFAULT_PITCH_AXIS)!;
    holed.forEach((sample, at) => expect(sample.weight).toBeCloseTo(clean[at].weight, 6));
  });
});
