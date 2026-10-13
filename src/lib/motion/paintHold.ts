/* Holds an arrival on its first frame until the WebView has painted it
   (ticket 09).

   A view transition's incoming screen is mounted while rendering is paused
   and first drawn once its animations start. On the Pixel 10a the frame
   that rasters it and builds the transition's render passes takes 80 to
   130 ms on a first visit, and it is not the first: three to five quick
   frames come before it. Unheld, it landed in the first 50 ms of the
   motion. Held here, the animations stay on their first frame while that
   frame is drawn, so what the person sees is the frozen frame lasting a
   little longer and then a motion with no gap in it. The incoming screen
   starts its fade at a nil opacity rather than 0 (NIL_OPACITY), or nothing
   would be drawn while it waits.

   Every finite animation running at that moment is held, not only the
   transition's own: the entrances inside the incoming screen started on the
   same clock and have to stay on it. Loops are left alone, and so is
   anything that was not running when the hold began or that finished or
   was cancelled while held. */
import { afterQuickFrames } from './quickFrames';

/** Until the slow frame has shown, six quick frames: the frames before it
    are quick, and two of them ended the hold before it in 10 of 16 holds
    measured. Once it has, two quick frames after it mean it is paid for. A
    screen that never has a slow frame waits out the six, 50 ms at 120 Hz. */
const PATIENCE = 6;
const QUICK_FRAMES = 2;
/** Longer than the slowest first frame measured (131.8 ms), short enough
    that a device which never settles still answers the tap promptly. */
const HOLD_CAP_MS = 300;

/** Calls `go` once the frame that first draws newly arrived content has
    passed, by the rule above, or at the cap. The hold below and the late
    reveals (screenArrival.ts' playAfterPaint) both wait this way. */
export function afterPaint(view: Window, go: () => void): void {
  afterQuickFrames(view, go, { count: QUICK_FRAMES, patience: PATIENCE, capMs: HOLD_CAP_MS });
}

export function holdUntilPainted(doc: Document): void {
  const view = doc.defaultView;
  if (!view) return;
  const held = doc.getAnimations().filter(
    (animation) => animation.playState === 'running' && animation.effect?.getComputedTiming().endTime !== Infinity
  );
  for (const animation of held) animation.pause();
  afterPaint(view, () => {
    for (const animation of held) if (animation.playState === 'paused') animation.play();
  });
}
