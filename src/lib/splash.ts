/* The handover from the first frame to the app (phase 14 pre-release
   ticket 13). app.html paints a ground and the mark before any script has
   run; this is what takes them away once boot has answered.

   It only adds a class. How the first frame leaves - opacity, over 280 ms -
   is app.html's CSS, and it is opacity and nothing else: the mark does not
   move on the way out, and the ground is the app's own --bg, so no frame of
   the fade has either of them somewhere new.

   Two animation frames after the call, not at it: the call comes from the
   effect that sees boot's state change, which is before the screen for that
   state has painted, and fading the first frame over a screen that has not
   arrived would show white.

   The element is removed when the fade has run, on a timer rather than on
   `transitionend`, which never fires for a tab that is hidden or a person
   who asked the system to remove animations. */

/** Longer than the slowest handover in app.html (the ground, then the mark). */
const REMOVE_AFTER_MS = 800;

export function dismissSplash(doc: Document = document): void {
  const splash = doc.getElementById('splash');
  if (!splash || splash.classList.contains('is-leaving')) return;
  const leave = () => {
    splash.classList.add('is-leaving');
    setTimeout(() => splash.remove(), REMOVE_AFTER_MS);
  };
  requestAnimationFrame(() => requestAnimationFrame(leave));
}
