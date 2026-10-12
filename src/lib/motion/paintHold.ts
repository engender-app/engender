/* Holds an arrival on its first frame until the WebView has painted it
   (ticket 09).

   A view transition's incoming screen is mounted while rendering is paused
   and first drawn on the frame its animations start. On the Pixel 10a that
   frame rasters the whole screen and builds the transition's render passes:
   50 to 130 ms on a first visit, which used to be the first frame of the
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

/** Two quick frames: the arriving screen's cost is one or two frames, not
    the several a cold start keeps compiling for. */
const QUICK_FRAMES = 2;
/** Longer than the slowest first frame measured (131.8 ms), short enough
    that a device which never settles still answers the tap promptly. */
const HOLD_CAP_MS = 300;

export function holdUntilPainted(doc: Document): void {
  const view = doc.defaultView;
  if (!view) return;
  const held = doc.getAnimations().filter(
    (animation) => animation.playState === 'running' && animation.effect?.getComputedTiming().endTime !== Infinity
  );
  for (const animation of held) animation.pause();
  afterQuickFrames(
    view,
    () => {
      for (const animation of held) if (animation.playState === 'paused') animation.play();
    },
    { count: QUICK_FRAMES, capMs: HOLD_CAP_MS }
  );
}
