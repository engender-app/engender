/* The handover from the first frame to the app (phase 14 pre-release
   ticket 13, after-release ticket 31). app.html paints a ground and the
   mark before any script has run; this is what takes them away.

   How the first frame leaves is app.html's CSS: the mark does not move on
   the way out, and the ground is the app's own --bg, so no frame of the
   handover has either of them somewhere new.

   When it leaves is `splashMayLeave`: once boot has answered, and once the
   screen it answered with is the one the layout is drawing. Ticket 13 had
   it start leaving when the layout mounted, so that a screen's own
   entrances would not finish unseen underneath. But the layout mounts while
   boot is still working, and on a first visit boot then answers "set up":
   the layout drops the screen it had started and draws nothing while it
   navigates to onboarding. Measured at 4x CPU in after-release 31, the
   first frame had faded onto an empty ground by +420 ms and onboarding
   arrived whole, in one frame, at +687 ms. Waiting for the answer means
   the first frame dissolves into a screen that is there.

   `answerSplash` ends the handover and takes the element out when it has
   run, on a timer rather than on `transitionend`, which never fires for a
   tab that is hidden or a person who asked the system to remove
   animations. */

/** Longer than the slowest handover in app.html. */
const REMOVE_AFTER_MS = 800;

/** Whether the first frame may hand over: boot has answered, and the
    layout is not between screens on the way to onboarding. */
export function splashMayLeave(bootStatus: string, redirecting: boolean): boolean {
  return bootStatus !== 'booting' && !redirecting;
}

export function answerSplash(doc: Document = document): void {
  const splash = doc.getElementById('splash');
  if (!splash || splash.classList.contains('is-answered')) return;
  splash.classList.add('is-leaving', 'is-answered');
  setTimeout(() => splash.remove(), REMOVE_AFTER_MS);
}
