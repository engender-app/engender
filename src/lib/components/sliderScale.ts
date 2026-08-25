/* Where a slider's stops are, which is the same question as where its tick
   marks go (phase 5 ticket 30).

   A slider with no marked stops asks for a precision it cannot deliver. The
   0-100 scale is the case that makes it obvious: 101 values across 330px of
   phone is 3.3px per value, so a fingertip picks a number it did not aim at,
   and the readout implies the difference between 62 and 63 meant something.
   So the stops are spaced far enough apart to be hit on purpose, every stop
   is marked, and the thumb lands on one.

   The spacing rule is one line: take the finest step that divides the span
   exactly and still leaves at most MAX_STOPS marks. On 0-10 that is 1 - all
   eleven values stay reachable, because eleven of them already were - and on
   0-100 it is 5, which is 21 marks about 16px apart. Nothing is lost on the
   scale that was already usable, and the one that was not becomes usable. */

/** Marks any closer together than about 16px at 390px width stop reading as
    separate stops and stop being separately hittable, and 21 across the
    width of a phone is where that lands. */
const MAX_STOPS = 21;

/** Fine before coarse, so the first candidate that fits is the one taken and
    a scale is never made blunter than it has to be.

    Two candidates because the app has two spans: gender dimensions are 0-10
    or 0-100 (`settings/dimension` offers those and nothing else) and body
    regions are 0-100 (`bodyMap.ts`). A third would be a guess about a scale
    nobody has made. A span neither divides gets no ruler rather than a
    wrong one. */
const STEPS = [1, 5];

export interface SliderScaleStops {
  /** What one arrow key, or one drag detent, moves the value by. */
  step: number;
  /** Every value the thumb can rest on, low to high. Empty when the span
      cannot be marked at all, which is a scale this app cannot create. */
  stops: number[];
  /** Every nth stop is drawn taller, counting from the low end. 0 for none. */
  majorEvery: number;
}

export function sliderScaleStops(min: number, max: number): SliderScaleStops {
  const span = max - min;
  if (!Number.isFinite(span) || span <= 0) return { step: 1, stops: [], majorEvery: 0 };

  const step = STEPS.find((candidate) => span % candidate === 0 && span / candidate + 1 <= MAX_STOPS);
  if (step === undefined) return { step: 1, stops: [], majorEvery: 0 };

  const count = span / step + 1;
  const stops = Array.from({ length: count }, (_, i) => min + i * step);
  return { step, stops, majorEvery: majorFor(count) };
}

/** A taller mark every fifth stop, which is what both of the app's scales
    take: 0/5/10 on the eleven-stop one, 0/25/50/75/100 on the 21-stop one.
    A span that does not divide by five gets no majors rather than a ruler
    whose last major sits somewhere arbitrary. */
function majorFor(count: number): number {
  return (count - 1) % 5 === 0 ? 5 : 0;
}

/** The nearest stop to `value`, which is where a drag or an arrow key leaves
    the thumb. Off-stop values already in a journal are left alone until
    somebody moves the control - a stored 63 renders at 63, and snaps to 65
    only when it is edited. Rewriting them on mount would be the app editing
    entries nobody opened. */
export function snapToStop(value: number, min: number, max: number, step: number): number {
  const snapped = min + Math.round((value - min) / step) * step;
  return Math.min(max, Math.max(min, snapped));
}

/** What the thumb shows when the value is null.

    A slider's thumb has to rest somewhere, and an unset scale has no value to
    rest on, so it rests in the middle and the control is dimmed instead
    (ticket 31). Its own function because two things ask it: the control
    positions its thumb by it, and the readout above it travels by it. */
export function displayValue(value: number | null, min: number, max: number): number {
  return value ?? Math.round((min + max) / 2);
}

/** How far along the scale a value sits, as a CSS percentage.

    The control gets this from melt, which computes it to position its own
    thumb. The readout above the control needs the same number and cannot read
    melt's - a custom property set on the control does not travel back up the
    tree - so this is the one place the arithmetic is written on our side of
    that line, rather than inline in the component that happens to need it. */
export function percentAlong(value: number | null, min: number, max: number): string {
  return `${((displayValue(value, min, max) - min) / (max - min)) * 100}%`;
}
