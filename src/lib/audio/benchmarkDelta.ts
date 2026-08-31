/* What changed between two voice benchmarks (phase 5 deepening ticket 16,
   CONTEXT: "Voice benchmark").

   Descriptive only (PRODUCT.md:109): a difference in Hz, a difference in
   semitones, a difference in F1/F2. No direction is named as better or
   worse, and nothing here decides that on its own - a caller states the
   numbers and stops.

   Two benchmarks are comparable only if they were read from the same
   passage (CONTEXT: "Benchmark passage") - a rate and a pitch measured over
   different words are different numbers, not a trend. That gate lives here
   rather than in the page, so a caller cannot compute a delta across
   passages by forgetting to check first. */

export interface BenchmarkForDelta {
  passageKey: string;
  f0MedianHz: number;
  f1Hz: number | null;
  f2Hz: number | null;
}

export interface AcousticDelta {
  f0DeltaHz: number;
  /** 12 * log2(ratio) - equal-tempered semitones, the same scale
      audio/pitch.ts's noteName is built on. Doubling the frequency is
      +12 semitones by definition; halving it is -12. */
  f0DeltaSemitones: number;
  /** null when either take has no resonance figures (the vowel step was
      skipped or never cleared the gate) - not zero, which would say the
      resonance held steady when it was never measured at all. */
  f1DeltaHz: number | null;
  f2DeltaHz: number | null;
}

/** `from` compared to `to`: every figure is `to`'s minus `from`'s, so a
    caller comparing the earlier of two anchors against the later one reads
    the delta as what changed since the earlier take. Null when the two
    passages differ - see the header. */
export function acousticDelta(from: BenchmarkForDelta, to: BenchmarkForDelta): AcousticDelta | null {
  if (from.passageKey !== to.passageKey) return null;
  return {
    f0DeltaHz: to.f0MedianHz - from.f0MedianHz,
    f0DeltaSemitones: 12 * Math.log2(to.f0MedianHz / from.f0MedianHz),
    f1DeltaHz: from.f1Hz !== null && to.f1Hz !== null ? to.f1Hz - from.f1Hz : null,
    f2DeltaHz: from.f2Hz !== null && to.f2Hz !== null ? to.f2Hz - from.f2Hz : null
  };
}
