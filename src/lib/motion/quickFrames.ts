/* Wait for quick frames after drawing faint content to warm up the
   WebView's raster and Vulkan work. Opacity zero skips the work.
   Splash and arrival holds call this before motion starts.

   Callbacks run before paint. Exclude a busy frame and the next one.
   A quick frame takes less than 1.5× the fastest observed frame,
   bounded at 25–50 ms. A cap covers hidden or unsettled pages. */

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
