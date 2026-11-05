/* A press held on a grid cell, and what it means (pre-release-human 12):
   a finger kept still on a photograph for HOLD_MS starts picking
   photographs to delete; a finger that travels more than HOLD_SLOP_PX
   first is a scroll and picks nothing.

   The decision is here, apart from the DOM, so it can be driven with
   plain numbers. holdSelect.svelte.ts wires it to pointer events and owns
   the selection. */

/** Android's own long-press timeout (ViewConfiguration). */
export const HOLD_MS = 500;
/** Android's touch slop at a typical density, in CSS px: past this a
    press is a scroll. */
import { TAP_SLOP } from '../../motion/tapReplay';
export const HOLD_SLOP_PX = TAP_SLOP;

export interface HoldPress {
  /** The finger moved. Returns false once the press has become a scroll. */
  move(x: number, y: number): boolean;
  /** The finger lifted, or the browser took the gesture for a pan. */
  end(): void;
  /** Whether the hold fired, so the click that follows the lift is the
      hold's and not a tap. */
  readonly held: boolean;
}

/** Starts timing a press at (x, y). `onHold` runs once, after HOLD_MS, if
    the press is still down and has not travelled. */
export function startHold(
  x: number,
  y: number,
  onHold: () => void,
  timers: { set: (run: () => void, ms: number) => unknown; clear: (handle: unknown) => void } = {
    set: (run, ms) => setTimeout(run, ms),
    clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>)
  }
): HoldPress {
  let held = false;
  let live = true;
  const timer = timers.set(() => {
    if (!live) return;
    live = false;
    held = true;
    onHold();
  }, HOLD_MS);
  const stop = () => {
    if (!live) return;
    live = false;
    timers.clear(timer);
  };
  return {
    move(nx, ny) {
      if (live && Math.hypot(nx - x, ny - y) > HOLD_SLOP_PX) stop();
      return held || live;
    },
    end: stop,
    get held() {
      return held;
    }
  };
}
