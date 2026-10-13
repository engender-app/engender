/* Waits for a run of quick frames: the sign that whatever the last frames
   were paying for has been paid, so motion started now does not stall on
   its first frames.

   On the Pixel 10a's WebView, the first time a process draws a kind of
   content it rasters it and compiles the Vulkan pipelines it needs, and the
   frame waits for both. Content at opacity 0 is not drawn, so it pays this
   on the first frame it is visible, which is the first frame of its fade.
   The splash hold (ticket 08) and the arrival hold (ticket 09) both draw
   the content at a nil opacity while nothing is moving, and use this to
   tell when it has been paid for.

   A frame callback runs before that frame paints, so the frame after the
   work stopped is the first that can show what it cost: a busy frame and
   the one after it never count. A frame is quick under one and a half of
   the shortest frame seen, kept between 25 and 50 ms, so a display slower
   than 60 Hz settles too and a stall is never quick. The cap covers a
   device that never settles and a hidden page that draws no frames. */

const QUICK_FRAME_MS = 25;
const SLOWEST_QUICK_FRAME_MS = 50;

/** Calls `go` once, after `count` quick frames in a row or at `capMs`,
    whichever comes first; `busy` keeps frames from counting while it is
    true. With `patience`, it waits for that many quick frames until the
    first slow one has shown, and `count` only after it: a cost that lands a
    few frames late is seen rather than run into. Returns a function that
    calls the wait off. */
export function afterQuickFrames(
  view: Window,
  go: () => void,
  { count, patience = count, capMs, busy = () => false }: { count: number; patience?: number; capMs: number; busy?: () => boolean }
): () => void {
  let done = false;
  const timer = setTimeout(() => finish(), capMs);
  function finish() {
    if (done) return;
    done = true;
    clearTimeout(timer);
    go();
  }
  let last: number | undefined;
  let shortest = Infinity;
  let quick = 0;
  let wasBusy = false;
  let sawSlow = false;
  const frame = (now: number) => {
    if (done) return;
    const isBusy = busy();
    const took = last === undefined ? Infinity : now - last;
    shortest = Math.min(shortest, took);
    const quickMs = Math.max(QUICK_FRAME_MS, Math.min(SLOWEST_QUICK_FRAME_MS, 1.5 * shortest));
    const counts = !isBusy && !wasBusy && last !== undefined;
    quick = counts && took < quickMs ? quick + 1 : 0;
    if (counts && took >= quickMs) sawSlow = true;
    wasBusy = isBusy;
    last = now;
    if (quick >= (sawSlow ? count : patience)) finish();
    else view.requestAnimationFrame(frame);
  };
  view.requestAnimationFrame(frame);
  return () => {
    done = true;
    clearTimeout(timer);
  };
}
