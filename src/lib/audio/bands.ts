/* The absolute pitch axis, and the reference bands drawn on it (phase 8
   features ticket 09, ADR-0059).

   **Why this exists at all.** The live gauge used to plot semitones against
   a rolling median of whatever was on screen, chosen so the figure could
   never imply a target. It could not: it also could not say where a voice
   was, because its own middle moved with the voice. Alicja's verdict was
   that the relative graph was confusing, and an axis that moves is an axis
   nothing can be drawn against - no reference band, no comfort band, no
   comparison between two takes months apart.

   So the axis is absolute Hz, and ADR-0059 narrows PRODUCT.md's rule to
   allow the two typical ranges on it, with their figures, their source and
   a caveat. The narrowing stops here: it is the pitch graph and nothing
   else. There is still no verdict, no score, no label on a voice and no
   direction of travel - a band is a region with a name and a citation, and
   the person's own comfort band is a different object that ships beside it.
   Formant search windows are untouched, and resonance.ts says why.

   **Semitone-linear.** The axis is log2 in Hz, so the distance from 100 to
   200 Hz is the distance from 150 to 300: pitch is heard in ratios, the
   spread the benchmark already reports is in semitones, and on a linear Hz
   axis the low half of a voice would be squashed into a third of the
   height. Every figure here is a fraction of the drawing box, so the
   component holding it owns its own pixels.

   Pure arithmetic, like its siblings: no clock, no database, nothing from
   paraglide (ADR-0016). The band captions and the caveat are the screen's,
   because they are copy. */

export type PitchBandKey = 'cisMan' | 'cisWoman' | 'overlap';

export interface PitchBand {
  key: PitchBandKey;
  lowHz: number;
  highHz: number;
}

/** The two typical speaking-pitch ranges, as ADR-0059 fixes them: adult
    speakers, habitual reading pitch, from Baken and Orlikoff's Clinical
    Measurement of Speech and Voice (2000).

    The man band's upper bound is the loose end of the spread that reference
    reports rather than the 155 Hz figure often quoted from it, and that is a
    deliberate choice recorded in the ADR: at 155 the two ranges do not meet
    at all, and the region between them - the one a great many of this app's
    users are working towards - would be a gap with no name, or worse, a line
    where two blocks touch. A line there reads as a pass mark. */
export const TYPICAL_RANGES: readonly PitchBand[] = [
  { key: 'cisMan', lowHz: 85, highHz: 180 },
  { key: 'cisWoman', lowHz: 165, highHz: 255 }
];

/** Where two ranges genuinely coincide, or null when they do not meet.
    Computed rather than written down, so the overlap cannot drift out of
    agreement with the ranges it is the overlap of. */
export function overlapOf(a: PitchBand, b: PitchBand): PitchBand | null {
  const lowHz = Math.max(a.lowHz, b.lowHz);
  const highHz = Math.min(a.highHz, b.highHz);
  return lowHz < highHz ? { key: 'overlap', lowHz, highHz } : null;
}

/** What the figure draws: the two ranges, and their overlap as a band in
    its own right with its own caption. */
const OVERLAP = overlapOf(TYPICAL_RANGES[0], TYPICAL_RANGES[1]);

export const REFERENCE_BANDS: readonly PitchBand[] = OVERLAP
  ? [...TYPICAL_RANGES, OVERLAP]
  : TYPICAL_RANGES;

export interface PitchAxis {
  lowHz: number;
  highHz: number;
}

/** The axis an ordinary take is drawn on. Fixed, and wide enough that every
    reference band sits clear of both edges: two benchmarks months apart are
    only comparable by eye if the axis under them did not move, so the
    common case must not compute its own bounds from its own data. */
export const DEFAULT_PITCH_AXIS: PitchAxis = { lowHz: 70, highHz: 300 };

/** A quarter-octave of air, in ratio terms, kept between the axis end and
    whatever forced it out there. */
const WIDEN_RATIO = 2 ** (3 / 12);

/** The axis for one figure: the default, widened only by what would
    otherwise be drawn off it. A voice below the man band or above the woman
    band is a real voice and gets shown, not clipped to the edge where it
    would read as a flat line against the frame. */
export function pitchAxis(subject: {
  hz?: readonly (number | null)[];
  comfort?: { lowHz: number; highHz: number } | null;
}): PitchAxis {
  const voiced = (subject.hz ?? []).filter((hz): hz is number => hz !== null);
  const marks = [...voiced, ...(subject.comfort ? [subject.comfort.lowHz, subject.comfort.highHz] : [])];

  return marks.reduce<PitchAxis>(
    (axis, hz) => ({
      lowHz: Math.min(axis.lowHz, hz / WIDEN_RATIO),
      highHz: Math.max(axis.highHz, hz * WIDEN_RATIO)
    }),
    DEFAULT_PITCH_AXIS
  );
}

/** Where a frequency sits on the axis: 0 at the bottom, 1 at the top,
    clamped at both. Clamped rather than dropped, because the frame this
    lands in is the drawing box and a point beyond it has to stop at the
    edge rather than be painted outside. */
export function axisFraction(hz: number, axis: PitchAxis): number {
  const at = Math.log2(hz / axis.lowHz) / Math.log2(axis.highHz / axis.lowHz);
  return Math.max(0, Math.min(1, at));
}

/** The frequencies worth a gridline: the band edges, which are the only
    values on this axis that mean anything. Deduplicated, because 165 Hz is
    the woman band's floor and the overlap's floor and is one line. */
export function bandEdges(): number[] {
  const edges = new Set<number>();
  for (const band of REFERENCE_BANDS) {
    edges.add(band.lowHz);
    edges.add(band.highHz);
  }
  return [...edges].sort((a, b) => a - b);
}

/** What a voice can plausibly be, for reading a typed-in comfort band. Wider
    than the tracker's own search range at neither end - a band it could
    never contain a frame of is a typo, not a preference. */
const COMFORT_FLOOR_HZ = 60;
const COMFORT_CEILING_HZ = 500;

/** The person's own comfort band, from the two numbers they typed. There is
    no default and no norm table behind it: absent unless both ends are set,
    and it is a different object from the reference bands - theirs is a
    citation, this one is a decision.

    Read the way round it was meant if the two arrived swapped, and refused
    outright if either end is somewhere no voice goes. */
export function comfortBand(
  lowHz: number | null,
  highHz: number | null
): { lowHz: number; highHz: number } | null {
  if (lowHz === null || highHz === null) return null;
  const low = Math.min(lowHz, highHz);
  const high = Math.max(lowHz, highHz);
  if (low === high) return null;
  if (low < COMFORT_FLOOR_HZ || high > COMFORT_CEILING_HZ) return null;
  return { lowHz: low, highHz: high };
}

/** Pushes a descending list of label positions apart so no two are closer
    than `minGap`, keeping each crowded pair centred on where it was and
    keeping every label inside the 0-to-100 box.

    Here rather than in the component because it is geometry, and because it
    is the kind of arithmetic that silently stops working: 165 and 180 Hz are
    under six per cent of this axis apart, so their two numbers rendered as
    one smudge, and both of them are load-bearing. Dropping one was the
    other option and it loses a band's edge from the readout.

    One pass down, then one back up. The downward pass fixes every collision
    and can push the last label off the bottom; the upward pass pulls the
    whole crowded run back inside, which is why a single pass is not
    enough. */
export function spreadLabels(at: readonly number[], minGap: number): number[] {
  const spread = [...at];
  for (let i = 1; i < spread.length; i++) {
    const gap = spread[i - 1] - spread[i];
    if (gap < minGap) {
      // Half each, so a pair keeps its own middle rather than the lower one
      // carrying the whole move.
      const push = (minGap - gap) / 2;
      spread[i - 1] = Math.min(100, spread[i - 1] + push);
      spread[i] = spread[i] - push;
    }
  }
  for (let i = spread.length - 1; i > 0; i--) {
    if (spread[i] < 0) spread[i] = 0;
    if (spread[i - 1] - spread[i] < minGap) {
      spread[i - 1] = Math.min(100, spread[i] + minGap);
    }
  }
  return spread;
}
