/* The arithmetic behind PhotoWipe.svelte (phase 10 redesign ticket 55):
   where a pointer lands across the frame, where a key moves the divider to,
   and whether the two photographs are different enough shapes that the frame
   has to say how it reconciled them.

   Framework-free and node-tested for the reason photoSection.ts is - $state
   only works in a .svelte file, so the rules live here, where the component
   merely holds the fraction and draws it. */

/** What one arrow key moves the divider by, as a fraction of the frame.

    5% is 18px across a 358px column, which is a press a person can see land,
    and twenty of them to cross the frame. The app's one slider picks its own
    step the same way and lands on the same number for a 0-100 scale
    (sliderScale.ts), for the same reason: a step small enough to be
    imperceptible asks for a precision the control cannot deliver. */
export const WIPE_KEY_STEP = 0.05;

/** A photograph's own pixel dimensions, as the browser decoded them. */
export interface PhotoShape {
  width: number;
  height: number;
}

/** How far across `frame` a pointer at `clientX` is, clamped to the frame's
    own edges - a drag that leaves the frame pins the divider to the side it
    left by rather than letting it run off. */
export function fractionAt(clientX: number, frame: { left: number; width: number }): number {
  if (frame.width <= 0) return 0;
  return clamp((clientX - frame.left) / frame.width);
}

/** Where `key` moves the divider from `fraction`, or null for a key this
    control does not take - which is the caller's signal to leave the event
    alone rather than swallow it. Home and End are the two ends, so a
    keyboard can see either photograph whole without twenty presses. */
export function fractionForKey(key: string, fraction: number): number | null {
  if (key === 'ArrowLeft' || key === 'ArrowDown') return clamp(fraction - WIPE_KEY_STEP);
  if (key === 'ArrowRight' || key === 'ArrowUp') return clamp(fraction + WIPE_KEY_STEP);
  if (key === 'Home') return 0;
  if (key === 'End') return 1;
  return null;
}

/** Whether the frame has to state its crop.

    Two photographs of the same body months apart are the same shape whenever
    they came off the same camera, and then the frame reconciles nothing and
    has nothing to say. They are different shapes when one was scanned, sent,
    cropped or shot on another phone, and then the frame is cropping one of
    them more than the other and a person comparing pixels deserves to be
    told. A percent of tolerance, because a JPEG rounded to even dimensions
    can be a pixel off its own ratio and that is not a different shape.

    A shape nobody has decoded yet is not a difference either: it is a photo
    still loading, or one with no file at all, and the note would flicker on
    and off as the bytes arrived. */
export function cropDiffers(a: PhotoShape | null, b: PhotoShape | null): boolean {
  if (!a || !b) return false;
  const ratioA = aspect(a);
  const ratioB = aspect(b);
  if (ratioA === null || ratioB === null) return false;
  return Math.abs(ratioA - ratioB) / Math.max(ratioA, ratioB) > 0.01;
}

function aspect(shape: PhotoShape): number | null {
  if (shape.width <= 0 || shape.height <= 0) return null;
  return shape.width / shape.height;
}

function clamp(fraction: number): number {
  if (!Number.isFinite(fraction)) return 0;
  return Math.min(1, Math.max(0, fraction));
}
