/* Labels for hertz and semitone ticks on pitch figures. */

import { m } from '$lib/paraglide/messages';

/** A frequency as this app writes one. */
export function hzLabel(hz: number): string {
  return m.vb_hz({ value: String(Math.round(hz)) });
}

/** A steadiness tick: how far this line is from the note being held, in
    semitones, signed so above and below are told apart and 0 carries no
    sign. Whole numbers, because the ticks are placed one semitone apart. */
export function semitoneLabel(semitones: number): string {
  const rounded = Math.round(semitones);
  if (rounded === 0) return '0';
  return rounded > 0 ? `+${rounded}` : String(rounded);
}
