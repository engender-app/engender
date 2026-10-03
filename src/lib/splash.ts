/* The handover from the first frame to the app (phase 14 pre-release
   ticket 13). app.html paints a ground and the mark before any script has
   run; this is what takes them away.

   Two steps, and both only add a class. How the first frame leaves is
   app.html's CSS, and it is opacity and nothing else: the mark does not move
   on the way out, and the ground is the app's own --bg, so no frame of the
   fade has either of them somewhere new.

   `releaseSplash` is the layout's mount. It is the moment the screen's own
   entrances begin (a nav pill fading in, a heading's rule drawing, a skeleton
   sweeping), and the first frame has to start leaving in that same frame:
   started at boot's answer instead, which on Home on the slow profile is
   0.4 s later, an entrance of 150 to 380 ms had finished entirely under the
   opaque first frame and was then revealed already in place, which is a cut.
   Measured in review-13: 5 of 26 entrance animations that way, none now.

   `answerSplash` is boot reporting any status but `booting`: a journal, a
   gate, a first run or a failure are all a screen. It ends the handover and
   takes the element out when the fade has run, on a timer rather than on
   `transitionend`, which never fires for a tab that is hidden or a person who
   asked the system to remove animations. */

/** Longer than the slowest handover in app.html. */
const REMOVE_AFTER_MS = 800;

export function releaseSplash(doc: Document = document): void {
  doc.getElementById('splash')?.classList.add('is-leaving');
}

export function answerSplash(doc: Document = document): void {
  const splash = doc.getElementById('splash');
  if (!splash || splash.classList.contains('is-answered')) return;
  splash.classList.add('is-leaving', 'is-answered');
  setTimeout(() => splash.remove(), REMOVE_AFTER_MS);
}
