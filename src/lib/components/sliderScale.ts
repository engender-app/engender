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
    a scale is never made blunter than it has to be. */
const STEPS = [1, 2, 5, 10];

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
    (ticket 31). Shared because two components need the same answer: the
    control positions its thumb by it, and the label above positions its
    readout by it. */
export function displayValue(value: number | null, min: number, max: number): number {
  return value ?? Math.round((min + max) / 2);
}
