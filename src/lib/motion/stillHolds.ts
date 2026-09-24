/* Where a looping keyframe animation actually moves, and when it next will
   (ux-carpet 228).

   A face's glance and blink are infinite CSS loops (moodGlance.ts), and for
   most of each cycle they hold still: the glance moves for three 190ms
   stretches in 13-15s, the blink for 8% of 4.3-5.1s. Chromium cannot tell a
   hold from motion, so a running animation costs a frame on every vsync for
   its whole life - 120 a second on the Pixel for five faces that are, most of
   the time, not moving. The eyes are SVG children, which never run on the
   compositor, so every one of those frames is main-thread work.

   So the face pauses its own animations while they hold and lets them run
   only across the stretches where the keyframes change. This file is the
   arithmetic for that: given an animation's keyframe offsets, its duration and
   its delay, where the moving windows are and how long until the next one.
   Nothing here changes what the animation shows - pausing inside a flat
   stretch leaves the value exactly where the running animation would have it.

   Rune-free, for the Node tier (stillHolds.test.ts). */

/** A stretch of one iteration, as fractions 0..1, in which the value changes. */
export type MovingWindow = { from: number; to: number };

/** The moving windows of a keyframe list, from the offsets of keyframes whose
    value differs from the one before. `values` are the keyframes' values in
    offset order, compared as strings; a keyframe that repeats the previous
    value starts a hold, not a move. Windows that touch are merged, and one
    that runs to the end of the iteration and resumes at its start is left as
    two, since the iteration boundary is where the loop restarts anyway. */
export function movingWindows(keyframes: { offset: number; value: string }[]): MovingWindow[] {
  const windows: MovingWindow[] = [];
  for (let i = 1; i < keyframes.length; i++) {
    const before = keyframes[i - 1];
    const here = keyframes[i];
    if (before.value === here.value) continue;
    const last = windows.at(-1);
    if (last && last.to >= before.offset) last.to = here.offset;
    else windows.push({ from: before.offset, to: here.offset });
  }
  return windows;
}

/** Where an animation with these timings is at `elapsed` ms since it
    started, as a position inside its current iteration (0..1), or null while
    it is still inside its delay. */
export function iterationProgress(elapsed: number, duration: number, delay: number): number | null {
  const active = elapsed - delay;
  if (active < 0) return null;
  return (active % duration) / duration;
}

/** Whether `elapsed` falls inside one of the windows, give or take `margin`
    ms either side. The margin is what lets the face resume a frame early
    and pause a frame late: on either side of a window the value is flat, so
    running there costs a frame and shows nothing different. */
export function isMoving(
  elapsed: number,
  duration: number,
  delay: number,
  windows: MovingWindow[],
  margin: number
): boolean {
  const progress = iterationProgress(elapsed, duration, delay);
  if (progress === null) {
    // Inside the delay: the first iteration begins at `delay`, and a window
    // at offset 0 starts then.
    return windows.some((w) => w.from === 0) && delay - elapsed <= margin;
  }
  const at = progress * duration;
  return windows.some((w) => {
    const from = w.from * duration - margin;
    const to = w.to * duration + margin;
    // A window near either end of the iteration also covers the wrap.
    return (at >= from && at <= to) || (at + duration >= from && at + duration <= to) || (at - duration >= from && at - duration <= to);
  });
}

/** Milliseconds from `elapsed` until the animation next enters a window (less
    `margin`), or 0 if it is in one now. */
export function untilNextWindow(
  elapsed: number,
  duration: number,
  delay: number,
  windows: MovingWindow[],
  margin: number
): number {
  if (windows.length === 0) return Infinity;
  if (isMoving(elapsed, duration, delay, windows, margin)) return 0;
  if (elapsed < delay) return Math.max(0, delay + windows[0].from * duration - margin - elapsed);
  const at = ((elapsed - delay) % duration + duration) % duration;
  let best = Infinity;
  for (const w of windows) {
    let start = w.from * duration - margin;
    if (start < at) start += duration;
    best = Math.min(best, start - at);
  }
  return Math.max(0, best);
}

/** Milliseconds from `elapsed` until the window it is in ends (plus
    `margin`), or 0 if it is not in one. */
export function untilWindowEnds(
  elapsed: number,
  duration: number,
  delay: number,
  windows: MovingWindow[],
  margin: number
): number {
  const progress = iterationProgress(elapsed, duration, delay);
  if (progress === null) return 0;
  const at = progress * duration;
  for (const w of windows) {
    const from = w.from * duration - margin;
    const to = w.to * duration + margin;
    if (at >= from && at <= to) return to - at;
    if (at + duration >= from && at + duration <= to) return to - (at + duration);
  }
  return 0;
}
