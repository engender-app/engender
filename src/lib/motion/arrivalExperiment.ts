/* Ticket 09 measurement switch, removed before merge.

   localStorage `ticket09-arrival` picks an arm for the phone comparison:
   `nil` starts arrival fades at NIL_OPACITY, `hold` does that and holds a
   view transition on its first frame until it has painted. Anything else
   is the baseline. `ticket09-curve` = `now` lets the curve's read run while
   its screen arrives, as it did before. Read once per process, so every
   arrival in a run is on the same arm. */
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

let premount: boolean | undefined;

/** Whether Android mounts unvisited doors hidden while idle
    (`ticket09-premount` = `on`, premountDoors.ts). */
export function premountArm(): boolean {
  if (premount === undefined) {
    try {
      premount = localStorage.getItem('ticket09-premount') === 'on';
    } catch {
      premount = false;
    }
  }
  return premount;
}

let curveNow: boolean | undefined;

/** Whether the curve's read waits for the screen to be still on this run. */
export function curveWaits(): boolean {
  if (curveNow === undefined) {
    try {
      curveNow = localStorage.getItem('ticket09-curve') === 'now';
    } catch {
      curveNow = false;
    }
  }
  return !curveNow;
}

/** Where an arrival's fade starts on this arm. */
export function arrivalFadeFrom(): number {
  return arrivalArm() === 'base' ? 0 : NIL_OPACITY;
}

/** Puts the arm on <html> for the stylesheet's view-transition keyframes. */
export function stampArrivalArm(doc: Document = document): void {
  if (arrivalArm() !== 'base') doc.documentElement.dataset.arrivalArm = arrivalArm();
}
