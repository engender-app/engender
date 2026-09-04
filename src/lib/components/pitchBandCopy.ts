/* The words on the pitch figure (phase 8 features ticket 09, ADR-0059).

   Four callers draw the same bands - the live gauge, a finished take, the
   compare pair's shared caption and the comfort-band editor - and the
   figure takes its captions as props or reads them here so the geometry
   stays free of paraglide (the reason audio/bands.ts holds no copy at all,
   ADR-0016). Passing the same functions from four call sites is how a band
   ends up called one thing on one tab and something else on the next.

   The source line is per language, because the bands are: an English
   passage carries Leung and others, a Polish one carries Andreeva and
   others, and the sentence names the population so the figure says whose
   figures those are rather than presenting them as universal. */

import { m } from '$lib/paraglide/messages';
import type { BandLanguage, MiddleBand, PitchBand } from '$lib/audio/bands';

/** A frequency as this app writes one. */
export function hzLabel(hz: number): string {
  return m.vb_hz({ value: String(Math.round(hz)) });
}

/** What a band is called. The middle one has two names, because a gap
    between two ranges and an intersection of them say opposite things
    about the same picture (bands.ts's `middleBand`). */
export function bandLabel(band: PitchBand): string {
  switch (band.key) {
    case 'cisMan':
      return m.vb_band_cis_man();
    case 'cisWoman':
      return m.vb_band_cis_woman();
    default:
      return (band as MiddleBand).kind === 'overlap'
        ? m.vb_band_overlap_region()
        : m.vb_band_between();
  }
}

/** Where this language's figures come from. */
export function sourceText(language: BandLanguage): string {
  return language === 'pl' ? m.vb_band_source_pl() : m.vb_band_source_en();
}

/** That they are averages, that they follow the passage's language, and
    that pitch is only part of it. */
export function caveatText(): string {
  return m.vb_band_caveat();
}

/** Said only where the passage is somebody's own words, so the figure
    admits that the language behind these bands is the app's rather than the
    passage's (bands.ts's `bandLanguageIsGuessed`). */
export function guessedLanguageText(): string {
  return m.vb_band_guessed();
}
