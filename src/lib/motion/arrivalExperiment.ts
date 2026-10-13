/* Ticket 09 measurement switch, removed before merge.

   localStorage `ticket09-arrival` picks an arm for the phone comparison:
   `nil` starts arrival fades at NIL_OPACITY, `hold` does that and holds a
   view transition on its first frame until it has painted. Anything else
   is the baseline. `ticket09-curve` = `now` lets the curve's read run while
   its screen arrives, as it did before. Read once per process, so every
   arrival in a run is on the same arm. `ticket09-hold-frames` = `6/2`
   makes the hold wait for 6 quick frames until a slow one shows and 2
   after it; unset, it waits for 2. */
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

let frames: { count: number; patience: number } | undefined;

/** The hold's quick-frame rule on this run. */
export function holdFrames(): { count: number; patience: number } {
  if (frames) return frames;
  frames = { count: 2, patience: 2 };
  try {
    const match = /^(\d+)\/(\d+)$/.exec(localStorage.getItem('ticket09-hold-frames') ?? '');
    if (match) frames = { patience: Number(match[1]), count: Number(match[2]) };
  } catch {
    /* keeps the default */
  }
  return frames;
}
