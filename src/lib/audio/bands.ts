/* Pitch axes and the person's optional comfort bracket.
   No population ranges are drawn or stored here. */

export type BandLanguage = 'en' | 'pl';

export function passageLanguage(passageKey: string): BandLanguage | null {
  if (!passageKey.startsWith('builtin-')) return null;
  return passageKey.slice('builtin-'.length) === 'pl' ? 'pl' : 'en';
}

export interface PitchAxis {
  lowHz: number;
  highHz: number;
}

/** Fixed axis for comparison between takes. */
export const DEFAULT_PITCH_AXIS: PitchAxis = { lowHz: 70, highHz: 330 };

/** A quarter-octave of air, in ratio terms, kept between the axis end and
    whatever forced it out there. */
const WIDEN_RATIO = 2 ** (3 / 12);

/** The axis for one figure: the default, widened only by what would
    otherwise be drawn off it. A voice below the default floor or above its
    ceiling is shown, not clipped to the edge where it
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

/** Pushes a descending list of label positions apart so no two are closer
    than `minGap`, keeping each crowded pair centred on where it was and
    keeping every label inside the 0-to-100 box.

    Here rather than in the component because it is geometry: nearby tick
    labels can render as one smudge. Both marks stay readable.

    One pass down, then one back up. The downward pass fixes every collision
    and can push the last label off the bottom; the upward pass pulls the
    whole crowded run back inside, which is why a single pass is not
    enough. */
export function spreadLabels(at: readonly number[], minGap: number, height: number): number[] {
  const spread = [...at];
  for (let i = 1; i < spread.length; i++) {
    const gap = spread[i - 1] - spread[i];
    if (gap < minGap) {
      // Half each, so a pair keeps its own middle rather than the lower one
      // carrying the whole move.
      const push = (minGap - gap) / 2;
      spread[i - 1] = Math.min(height, spread[i - 1] + push);
      spread[i] = spread[i] - push;
    }
  }
  for (let i = spread.length - 1; i > 0; i--) {
    if (spread[i] < 0) spread[i] = 0;
    if (spread[i - 1] - spread[i] < minGap) {
      spread[i - 1] = Math.min(height, spread[i] + minGap);
    }
  }
  return spread;
}

/** What a voice can plausibly be, for reading a typed-in comfort band. Wider
    than the tracker's own search range at neither end - a band it could
    never contain a frame of is a typo, not a preference. */
const COMFORT_FLOOR_HZ = 60;
const COMFORT_CEILING_HZ = 500;

/** The person's own comfort band, from the two numbers they typed. There is
    no default and no norm table behind it: absent unless both ends are set,

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

/** How many semitones either side of a held note its own figure shows.
    Three, because the gate fails a vowel whose F0 varies by more than 8%
    (quality.ts's MAX_F0_CV), which is about 1.4 semitones of spread - so a
    take about to fail is plainly off the middle without slamming into the
    edges. */
/* STEADINESS_SEMITONES stays exported only for its own test (AU-09 test-only
   review). */
export const STEADINESS_SEMITONES = 3;

/** The axis a held note is judged on: not absolute hertz but semitones
    around the note itself, because the vowel step's task is keeping one
    pitch rather than reaching one (Alicja, 2026-09-04) and a flat line is
    the whole answer. Null where nothing has been voiced yet and there is no
    note to centre on.

    This is deliberately the shape the whole ticket took the live gauge off:
    a relative axis is unreadable for "where is my voice" and exactly right
    for "am I holding still". The difference is that it is now one of two
    named instruments rather than the only one there is. */
export function steadinessAxis(referenceHz: number | null): PitchAxis | null {
  if (referenceHz === null) return null;
  const edge = 2 ** (STEADINESS_SEMITONES / 12);
  return { lowHz: referenceHz / edge, highHz: referenceHz * edge };
}

/** Round hertz across an axis, without population ranges.

    These numbers mark scale positions and name nobody's range. A trace on
    an unlabelled box shows movement without saying where it sits.

    Fifty hertz apart, which puts four or five marks on the default 70-330
    axis: closer and the labels collide at 148px of figure, wider and the
    only marks are at the ends. */
export function plainHzTicks(axis: PitchAxis, everyHz = 50): number[] {
  const ticks: number[] = [];
  for (let hz = Math.ceil(axis.lowHz / everyHz) * everyHz; hz <= axis.highHz; hz += everyHz) {
    ticks.push(hz);
  }
  return ticks;
}

/** Where the gutter's numbers go on a steadiness axis: one per semitone,
    as frequencies, so the figure's one Hz-to-y mapping still does the
    placing. */
export function steadinessTicks(referenceHz: number): number[] {
  const ticks: number[] = [];
  for (let semitone = -STEADINESS_SEMITONES; semitone <= STEADINESS_SEMITONES; semitone++) {
    ticks.push(referenceHz * 2 ** (semitone / 12));
  }
  return ticks;
}

/** How far a frequency is from a reference, in semitones, for labelling a
    steadiness tick. */
export function semitonesFrom(referenceHz: number, hz: number): number {
  return 12 * Math.log2(hz / referenceHz);
}
