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
   allow two typical speaking-pitch ranges on it, with their figures, their
   source and a caveat. The narrowing stops there: it is the pitch graph and
   nothing else. There is still no verdict, no score, no label on a voice and
   no direction of travel. Formant search windows are untouched
   (resonance.ts), and the semitone spread never gets a band at all - the
   reason is in the ADR and it is a measurement, not a preference.

   **The bands are per language, because pitch is.** They were English
   figures on both passages until 2026-09-04, which was wrong in the
   direction that hurts. Andreeva et al. 2014 measured read passages across
   four languages and say it plainly: the register of Polish male speakers
   "is in the same range of absolute f0 values as that of English and German
   female speakers". A Polish cis man reading aloud sits near 163 Hz, so
   English-sourced bands put him inside the band labelled cis woman - and
   put a Polish trans woman at 190 Hz inside that same band while she is
   still inside a male distribution centred above her. So a band renders
   only where the cited population's language matches the passage being
   read, keyed the way passages.ts already keys the passage itself.

   **Each range is mean +/- one standard deviation** of its published
   population, computed here rather than written down as bounds, so what the
   ADR cites and what the figure draws cannot drift apart. One SD is about
   two thirds of the speakers measured; it is the tightest claim the sources
   support, and widening it to two would put "typical cis man" on a range
   from 73 to 157 Hz, which is not a typical anything.

   **The middle band is computed, and it is usually a gap.** On sourced
   figures neither language's ranges meet, so the region between them is a
   gap rather than an intersection and is captioned as one. It is drawn
   because a bare line where two blocks touch reads as a pass mark, and
   because it is the region a great many of this app's users are working
   through. `middleBand` reports which kind it found; nothing here decides
   in advance.

   **Semitone-linear.** The axis is log2 in Hz, so the distance from 100 to
   200 Hz is the distance from 150 to 300: pitch is heard in ratios, the
   spread the benchmark already reports is in semitones, and on a linear Hz
   axis the low half of a voice would be squashed into a third of the
   height. Every figure here is a fraction of the drawing box, so the
   component holding it owns its own pixels.

   Pure arithmetic, like its siblings: no clock, no database, nothing from
   paraglide (ADR-0016). The band captions and the caveat are the screen's,
   because they are copy. */

/** The languages there are published read-passage figures for. Not "the
    languages the app speaks": a passage in a language with no figures falls
    back rather than inventing a band (`bandLanguageOf`). */
export type BandLanguage = 'en' | 'pl';

export type PopulationKey = 'cisMan' | 'cisWoman';
export type PitchBandKey = PopulationKey | 'between';

export interface PopulationBand {
  key: PopulationKey;
  lowHz: number;
  highHz: number;
}

export interface MiddleBand {
  key: 'between';
  /** Which one the arithmetic found. `overlap` where the two ranges
      genuinely coincide, `gap` where neither covers the region. The caption
      differs, because the two say opposite things about the same picture. */
  kind: 'overlap' | 'gap';
  lowHz: number;
  highHz: number;
}

export type PitchBand = PopulationBand | MiddleBand;

/** Mean and standard deviation of speaking f0 over a read passage, by
    language and population. ADR-0059 carries the citations and the
    corpus caveat; these are the numbers those papers report.

      en  Leung, Oates, Papp & Chan (2022), Journal of Voice 36(3):
          379 speakers of Australian English aged 18-60 reading a passage,
          creak separated from modal phonation before averaging.
      pl  Andreeva, Demenko, Moebius, Zimmerer, Juegler &
          Oleskowicz-Popiel (2014), Interspeech 2014: 48 Polish speakers
          from BABEL reading three five-sentence passages. */
const POPULATIONS: Record<BandLanguage, Record<PopulationKey, { meanHz: number; sdHz: number }>> = {
  en: {
    cisMan: { meanHz: 115, sdHz: 21 },
    cisWoman: { meanHz: 199, sdHz: 28 }
  },
  pl: {
    cisMan: { meanHz: 163, sdHz: 22 },
    cisWoman: { meanHz: 266, sdHz: 24 }
  }
};

/** The two typical ranges for a language, low band first. */
export function typicalRanges(language: BandLanguage): readonly PopulationBand[] {
  const population = POPULATIONS[language];
  return (['cisMan', 'cisWoman'] as const).map((key) => ({
    key,
    lowHz: population[key].meanHz - population[key].sdHz,
    highHz: population[key].meanHz + population[key].sdHz
  }));
}

/** What sits between two ranges: their intersection where they coincide,
    the space between them where they do not, or nothing at all where they
    meet exactly at a point.

    Computed rather than written down, so the middle band cannot drift out
    of agreement with the ranges it is the middle of, and so the caption
    cannot claim an overlap that the figures do not support. */
export function middleBand(a: PopulationBand, b: PopulationBand): MiddleBand | null {
  const [lower, upper] = a.lowHz <= b.lowHz ? [a, b] : [b, a];
  if (lower.highHz > upper.lowHz) {
    return { key: 'between', kind: 'overlap', lowHz: upper.lowHz, highHz: lower.highHz };
  }
  if (lower.highHz < upper.lowHz) {
    return { key: 'between', kind: 'gap', lowHz: lower.highHz, highHz: upper.lowHz };
  }
  return null;
}

/** What the figure draws for a language: the two ranges, and the middle
    band in its own right with its own caption. */
export function referenceBands(language: BandLanguage): readonly PitchBand[] {
  const ranges = typicalRanges(language);
  const middle = middleBand(ranges[0], ranges[1]);
  return middle ? [...ranges, middle] : ranges;
}

/** Which population's figures belong on a figure, and whether that is
    known or guessed. The two always travel together - a caption that names
    a language has to say when the language is a guess - so they are one
    object rather than two props that can be passed inconsistently.

    A built-in passage carries its language in its key
    (data/voice/passages.ts). A custom passage carries a fingerprint of its
    own text and no language at all, and the practise tab reads no passage
    whatsoever; for both, the app's own language is the best signal there is
    - Alicja's call on 2026-09-04 - and `guessed` is what makes the caption
    admit to it rather than presenting a guess as a fact. Pass `''` for "no
    passage".

    A language with no published figures falls back to English rather than
    drawing a band for a population nobody has measured. */
export function bandsFor(
  passageKey: string,
  appLocale: string
): { language: BandLanguage; guessed: boolean } {
  const known = passageKey.startsWith('builtin-');
  const fromPassage = known ? passageKey.slice('builtin-'.length) : appLocale;
  return { language: fromPassage === 'pl' ? 'pl' : 'en', guessed: !known };
}

export interface PitchAxis {
  lowHz: number;
  highHz: number;
}

/** The axis an ordinary take is drawn on. Fixed, and wide enough that every
    band of every language sits clear of both edges: two benchmarks months
    apart are only comparable by eye if the axis under them did not move, so
    the common case must not compute its own bounds from its own data. The
    ceiling clears the Polish cis woman range, which is the highest band
    there is. */
export const DEFAULT_PITCH_AXIS: PitchAxis = { lowHz: 70, highHz: 330 };

/** A quarter-octave of air, in ratio terms, kept between the axis end and
    whatever forced it out there. */
const WIDEN_RATIO = 2 ** (3 / 12);

/** The axis for one figure: the default, widened only by what would
    otherwise be drawn off it. A voice below the lowest band or above the
    highest is a real voice and gets shown, not clipped to the edge where it
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

/** The frequencies worth a number in the gutter: the band edges of the
    language being read, which are the only values on this axis that mean
    anything. Deduplicated - the middle band's edges are the two ranges'
    own, so there are four of them and not six. */
export function bandEdges(language: BandLanguage): number[] {
  const edges = new Set<number>();
  for (const band of referenceBands(language)) {
    edges.add(band.lowHz);
    edges.add(band.highHz);
  }
  return [...edges].sort((a, b) => a - b);
}

/** Pushes a descending list of label positions apart so no two are closer
    than `minGap`, keeping each crowded pair centred on where it was and
    keeping every label inside the 0-to-100 box.

    Here rather than in the component because it is geometry, and because it
    is the kind of arithmetic that silently stops working: two band edges
    can land under six per cent of the axis apart, so their numbers render as
    one smudge, and both of them are load-bearing. Dropping one was the
    other option and it loses a band's edge from the readout.

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

