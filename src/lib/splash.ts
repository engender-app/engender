/* Keep the first frame until boot and the destination screen are ready.
   app.html keeps the mark still and crossfades the app over the same
   body background. Waiting for the destination avoids fading to an
   empty page while first-run navigation starts.

   Wait for held reads, their arrival animations and three fast frames
   before fading. The WebView's first GPU work can stall the transition.
   A cap covers a hidden tab or a device that never settles. answerSplash
   uses a timer so cleanup also runs when transitionend never fires. */

import { afterQuickFrames } from './motion/quickFrames';

/** Longer than the slowest handover in app.html. */
const REMOVE_AFTER_MS = 800;
/** Three, because Home kept compiling pipelines over several frames after
    its reads answered (motion/quickFrames.ts says what counts as quick). */
const QUICK_FRAMES = 3;
const HOLD_CAP_MS = 2500;
const HELD_READS = '[data-app-root] [data-read-reserve-hold], [data-app-root] [data-gate-skeleton]';

/** Whether the first frame may hand over: boot has answered, and the
    layout is not between screens on the way to onboarding. */
export function splashMayLeave(bootStatus: string, redirecting: boolean): boolean {
  return bootStatus !== 'booting' && !redirecting;
}

export function answerSplash(doc: Document = document): void {
  const splash = doc.getElementById('splash');
  /* No first frame to cross with: the screen must not stay held under it. */
  if (!splash) {
    delete doc.documentElement.dataset.splash;
    return;
  }
  if (splash.classList.contains('is-answered')) return;
  splash.classList.add('is-answered');
  const view = doc.defaultView;
  if (view) whenSettled(doc, view, () => leave(doc, splash));
  else leave(doc, splash);
}

function leave(doc: Document, splash: HTMLElement): void {
  splash.classList.add('is-leaving');
  doc.documentElement.dataset.splash = 'leaving';
  setTimeout(() => {
    splash.remove();
    delete doc.documentElement.dataset.splash;
  }, REMOVE_AFTER_MS);
}

function whenSettled(doc: Document, view: Window, go: () => void): void {
  afterQuickFrames(view, go, { count: QUICK_FRAMES, capMs: HOLD_CAP_MS, busy: () => stillArriving(doc) });
}

/** A held read, or a finite animation still running on the screen; loops
    such as a skeleton's sweep never end, so they do not count. */
function stillArriving(doc: Document): boolean {
  if (doc.querySelector(HELD_READS)) return true;
  const root = doc.querySelector('[data-app-root]');
  return !!root
    ?.getAnimations({ subtree: true })
    .some((animation) => animation.playState === 'running' && animation.effect?.getComputedTiming().endTime !== Infinity);
}
