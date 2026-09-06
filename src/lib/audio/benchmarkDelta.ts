/* What changed between two voice benchmarks (CONTEXT: "Voice benchmark").

   Descriptive only (PRODUCT.md:109): a difference in Hz, a difference in
   semitones, a difference in F1/F2. No direction is named as better or
   worse, and nothing here decides that on its own - a caller states the
   numbers and stops.

   Two benchmarks are comparable only if they were read from the same
   passage (CONTEXT: "Benchmark passage") - a rate and a pitch measured over
   different words are different numbers, not a trend. That gate lives here
   rather than in the page, so a caller cannot compute a delta across
   passages by forgetting to check first.

   The second gate is the capture chain, and it is narrower. A change of
   passage leaves nothing to
   compare; a change of phone leaves the pitch figures intact and takes the
   resonance ones away, because mean F0 shows no significant effect of
   recording device while smartphone formants failed test-retest outright.
   So a delta across chains is not null, it is a delta with no resonance in
   it - and it says so with `sameChain` rather than by looking like a take
   whose vowel step was skipped. */

import { captureChainBreak, type ChainBreak } from './captureChain';

/** What decides whether two takes can be read together at all: the words
    they read and the equipment that recorded them. Its own type because two
    callers want the question and neither wants the figures - the pair delta
    below, and the own-series trend (charts/ownSeries.ts). */
export interface ComparableTake {
  passageKey: string;
  /** What recorded it (audio/captureChain.ts). Null on a benchmark from
      before capture chains were tracked, which is a chain nothing knows. */
  captureChain: string | null;
}

/** Why two takes are not one series, or null where they are.

    Passage first, where both changed at once: two passages leave nothing to
    compare - a rate over 98 English words and over 82 Polish ones are
    different numbers - while a change of phone leaves each figure meaning
    what it meant and only takes the join away. Naming the narrower reason
    would understate what happened.

    One function rather than a check per caller, so the chain gate is
    enforced once: it lives beside `acousticDelta` so a caller cannot
    compare across chains by forgetting to look. */
export type SeriesBreak = ChainBreak | 'passage';

export function comparabilityBreak(from: ComparableTake, to: ComparableTake): SeriesBreak | null {
  if (from.passageKey !== to.passageKey) return 'passage';
  return captureChainBreak(from.captureChain, to.captureChain);
}

/* BenchmarkForDelta stays exported only for its own test (AU-09 test-only
   review). */
export interface BenchmarkForDelta extends ComparableTake {
  f0MedianHz: number;
  f1Hz: number | null;
  f2Hz: number | null;
}

interface AcousticDelta {
  f0DeltaHz: number;
  /** 12 * log2(ratio) - equal-tempered semitones, the same scale
      audio/pitch.ts's noteName is built on. Doubling the frequency is
      +12 semitones by definition; halving it is -12. */
  f0DeltaSemitones: number;
  /** null when either take has no resonance figures (the vowel step was
      skipped or never cleared the gate), and null across two capture
      chains - not zero, which would say the resonance held steady when it
      was never measured at all, or was measured on another microphone. */
  f1DeltaHz: number | null;
  f2DeltaHz: number | null;
  /** Whether both takes came through one capture chain. What separates a
      resonance the app declines to compare from one it never had: a caller
      with a null `f1DeltaHz` and no way to tell those apart would have to
      say "not measured" about a figure that was measured. */
  sameChain: boolean;
}

/** `from` compared to `to`: every figure is `to`'s minus `from`'s, so a
    caller comparing the earlier of two anchors against the later one reads
    the delta as what changed since the earlier take. Null when the two
    passages differ - see the header. */
export function acousticDelta(from: BenchmarkForDelta, to: BenchmarkForDelta): AcousticDelta | null {
  /* The same gate the own series draws its breaks from: a passage change
     leaves nothing to compute, and anything narrower is a chain change,
     which takes the resonance figures and leaves the rest. */
  const gap = comparabilityBreak(from, to);
  if (gap === 'passage') return null;
  const sameChain = gap === null;
  return {
    f0DeltaHz: to.f0MedianHz - from.f0MedianHz,
    f0DeltaSemitones: 12 * Math.log2(to.f0MedianHz / from.f0MedianHz),
    f1DeltaHz: sameChain && from.f1Hz !== null && to.f1Hz !== null ? to.f1Hz - from.f1Hz : null,
    f2DeltaHz: sameChain && from.f2Hz !== null && to.f2Hz !== null ? to.f2Hz - from.f2Hz : null,
    sameChain
  };
}
