/* How a pitch figure's numbers and band names are written (phase 8
   features ticket 09, ADR-0059).

   Here rather than in audio/bands.ts because that module is pure arithmetic
   with nothing from paraglide in it (ADR-0016), and here rather than in the
   components because three of them write the same things: the live gauge
   and a finished take both label a gutter, and both they and the compare
   pair's shared caption name the same bands. Three call sites formatting a
   band name is how one ends up called something else on one tab.

   PitchBandsCaption.svelte reads its own sentences straight from paraglide
   rather than through here - a one-line wrapper over one message with one
   caller is a worse thing to maintain than the call it replaces. */

import { m } from '$lib/paraglide/messages';
import type { MiddleBand, PitchBand } from '$lib/audio/bands';

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

/** A steadiness tick: how far this line is from the note being held, in
    semitones, signed so above and below are told apart and 0 carries no
    sign. Whole numbers, because the ticks are placed one semitone apart. */
export function semitoneLabel(semitones: number): string {
  const rounded = Math.round(semitones);
  if (rounded === 0) return '0';
  return rounded > 0 ? `+${rounded}` : String(rounded);
}
