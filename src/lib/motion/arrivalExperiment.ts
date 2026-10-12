/* Ticket 09 measurement switch, removed before merge.

   localStorage `ticket09-arrival` picks an arm for the phone comparison:
   `nil` starts arrival fades at NIL_OPACITY, `hold` does that and holds a
   view transition on its first frame until it has painted. Anything else
   is the baseline. Read once per process, so every arrival in a run is on
   the same arm. */
import { NIL_OPACITY } from './tokens';

export type ArrivalArm = 'base' | 'nil' | 'hold';

let arm: ArrivalArm | undefined;

export function arrivalArm(): ArrivalArm {
  if (arm) return arm;
  try {
    const value = localStorage.getItem('ticket09-arrival');
    arm = value === 'nil' || value === 'hold' ? value : 'base';
  } catch {
    arm = 'base';
  }
  return arm;
}

/** Where an arrival's fade starts on this arm. */
export function arrivalFadeFrom(): number {
  return arrivalArm() === 'base' ? 0 : NIL_OPACITY;
}

/** Puts the arm on <html> for the stylesheet's view-transition keyframes. */
export function stampArrivalArm(doc: Document = document): void {
  if (arrivalArm() !== 'base') doc.documentElement.dataset.arrivalArm = arrivalArm();
}
