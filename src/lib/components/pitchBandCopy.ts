/* The words on the pitch figure (phase 8 features ticket 09, ADR-0059).

   Three callers draw the same bands - the live gauge, a finished take, and
   the comfort-band editor - and PitchFigure.svelte takes its captions as
   props so the geometry stays free of paraglide (the reason audio/bands.ts
   holds no copy at all, ADR-0016). Passing the same four functions from
   three call sites is how a band ends up called one thing on one tab and
   something else on the next, so they are written here once.

   The source line and the caveat are not decoration. ADR-0059 permits these
   bands only with their figures, their source and the sentence saying they
   are averages, which is why PitchFigure requires both as props rather than
   accepting them optionally. */

import { m } from '$lib/paraglide/messages';

/** A frequency as this app writes one. */
export function hzLabel(hz: number): string {
  return m.vb_hz({ value: String(Math.round(hz)) });
}

/** What each band is called. The keys are audio/bands.ts's own. */
export function bandLabel(key: string): string {
  switch (key) {
    case 'cisMan':
      return m.vb_band_cis_man();
    case 'cisWoman':
      return m.vb_band_cis_woman();
    default:
      return m.vb_band_overlap();
  }
}

/** Where the two ranges come from. */
export function sourceText(): string {
  return m.vb_band_source();
}

/** That they are averages, and that a voice is not one. */
export function caveatText(): string {
  return m.vb_band_caveat();
}
