/* Hold incoming motion at its first frame while the WebView paints
   it. The Pixel 10a first raster took 80–130ms after three to five
   quick frames. NIL_OPACITY makes the screen rasterize during the hold.

   Pause all finite animations already running so entrances stay in
   sync. Leave loops alone and skip animations that finish or cancel
   while held. */
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
    { count: QUICK_FRAMES, patience: PATIENCE, capMs: HOLD_CAP_MS }
  );
}
